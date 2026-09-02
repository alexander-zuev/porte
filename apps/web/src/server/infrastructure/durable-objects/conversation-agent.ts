import {
  AIChatAgent,
  type ChatRecoveryOptions,
  type ChatResponseResult,
  type OnChatMessageOptions,
} from '@cloudflare/ai-chat'
import {
  ConversationBusyError,
  ConversationIdSchema,
  HOST_CONVERSATION_SUBPROTOCOL,
  HostConversationMethods,
  HostIdSchema,
  HostOfflineError,
  INITIAL_CONVERSATION_LIVE_STATE,
  MessageIdSchema,
  createAttemptId,
  createLogger,
  liveStateFromConversation,
  reduceLiveState,
  type AttemptId,
  type CanonicalContent,
  type ConversationCommand,
  type ConversationEvent,
  type ConversationId,
  type ConversationLiveState,
  type FileDiff,
  type HostConversationMethodMap,
  type HostId,
  type MessageId,
  type TurnId,
  type UncommittedChanges,
} from '@porte/core'
import { toErrorPayload } from '@server/infrastructure/errors/to-error-payload.ts'
import type { RuntimeEnv } from '@server/infrastructure/runtime-env.ts'
import {
  ConversationEventProjector,
  createConversationEventProjectionState,
  type ConversationEventProjectionState,
} from '@web/lib/conversation/conversation-event-projector.ts'
import {
  attemptIdOfRow,
  conversationStateToMessages,
  dequeuedPositionOfRow,
  dequeuedRowMetadata,
  isDequeuedRow,
  isQueuedRow,
  nextUserRow,
  queuedPositionOfRow,
  queuedRowMetadata,
  queuedRows,
  turnIdOfRow,
  turnToMessages,
} from '@web/lib/conversation/conversation-state-messages.ts'
import {
  type AgentContext,
  type Connection,
  type ConnectionContext,
  type WSMessage,
  callable,
} from 'agents'
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type GenerateTextOnEndCallback,
  type UIMessage,
  type UIMessageChunk,
} from 'ai'
import { z } from 'zod'

// oxlint-disable-next-line import/no-cycle -- The Agents SDK resolves the runtime parent class.
import { HostRelayAgent } from './host-relay-agent.ts'
import { HostJsonRpcSocket } from './relay/host-json-rpc-socket.ts'
import { hostSequenceStorage } from './relay/host-sequence-storage.ts'
import { admitHostSocket, hasSubprotocol, openHostConnection } from './relay/host-subprotocol.ts'
import { RELAY_HOST_ID_HEADER } from './relay/relay-headers.ts'
import { rethrowAgentError } from './relay/rethrow-agent-error.ts'

const logger = createLogger('conversation-agent')
/** Holds no state of its own: every call takes the projection it works on. */
const eventProjector = new ConversationEventProjector()
const HOST_CONNECTION_TAG = 'host-conversation'
/** The SDK frame that replaces a browser's transcript (`agents/chat` wire types, not exported). */
const CHAT_MESSAGES_FRAME = 'cf_agent_chat_messages'

/** DO storage key for the Host's command list; too big for `state`. */
const COMMANDS_KEY = 'commands'
/** DO storage key for the queued row `sendQueuedNow` starts alone once the running turn ends. */
const SEND_NOW_KEY = 'queue.sendNow'
/** How long a drain waits for the SDK's own turn to settle before giving up until the next trigger. */
const DRAIN_STABLE_TIMEOUT_MS = 60_000

/** A user part the browser may queue: the same two kinds `sendMessage` builds. */
const QueuedPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1) }),
  z.object({
    type: z.literal('file'),
    mediaType: z.string().min(1),
    url: z.string().min(1),
    filename: z.string().min(1).optional(),
  }),
])
const QueueMessageInputSchema = z.strictObject({
  id: MessageIdSchema,
  parts: z.array(QueuedPartSchema).min(1),
})
const QueuedMessageRefSchema = z.strictObject({ messageId: MessageIdSchema })
const ReorderQueuedInputSchema = z.strictObject({
  messageId: MessageIdSchema,
  position: z.int().positive(),
})

/** A message the browser queues while a turn runs; the row keeps this id. */
export type QueueMessageInput = z.infer<typeof QueueMessageInputSchema>
/** One queued row, by the id the browser minted. */
export type QueuedMessageRef = z.infer<typeof QueuedMessageRefSchema>
/** Move one queued row to a 1-based position among the queued rows. */
export type ReorderQueuedInput = z.infer<typeof ReorderQueuedInputSchema>

type HostConnectionState = {
  readonly role: 'host-conversation'
  readonly hostId: HostId
  readonly connectedAt: number
}

/**
 * The stream one `onChatMessage` opened. Unbound until the Host answers the
 * attempt with `turn.started { turnId, attemptId }`; then every event of that
 * turn is projected into it.
 */
type ActiveStream =
  | {
      readonly binding: 'waiting'
      readonly attemptId: AttemptId
      readonly userMessageId: MessageId
      /** The row came from the queue, so a failed start puts it back there. */
      readonly queuedPosition: number | undefined
      readonly writer: WritableStreamDefaultWriter<UIMessageChunk>
      readonly projection: ConversationEventProjectionState
    }
  | {
      readonly binding: 'bound'
      readonly attemptId: AttemptId
      readonly userMessageId: MessageId
      readonly queuedPosition: number | undefined
      readonly turnId: TurnId
      readonly writer: WritableStreamDefaultWriter<UIMessageChunk>
      readonly projection: ConversationEventProjectionState
    }

/**
 * Child chat Agent for one conversation data connection.
 *
 * Owns a projection, never the truth: the machine runs the turn and keeps the
 * transcript. The stream writes the running turn; snapshots and the per-turn
 * reconcile write finished turns under the Host's ids.
 */
export class ConversationAgent extends AIChatAgent<RuntimeEnv, ConversationLiveState> {
  initialState: ConversationLiveState = INITIAL_CONVERSATION_LIVE_STATE
  private readonly conversationId: ConversationId
  private readonly hostSocket: HostJsonRpcSocket<typeof HostConversationMethods>
  private activeStream: ActiveStream | undefined
  private streamWork: Promise<void> = Promise.resolve()

  constructor(ctx: AgentContext, env: RuntimeEnv) {
    super(ctx, env)
    this.conversationId = ConversationIdSchema.parse(this.name)
    this.hostSocket = new HostJsonRpcSocket({
      methods: HostConversationMethods,
      notificationHandlers: {
        'conversation.event': (params) => this.acceptEvent(params.event),
      },
      sequence: hostSequenceStorage(ctx),
    })
  }

  /**
   * The stored transcript, for the page's first paint. Worker RPC, not the
   * SDK's `/get-messages`: an empty store is never served unconfirmed — it
   * syncs from the machine first, or throws `HostOfflineError`.
   */
  async readMessages(): Promise<UIMessage[]> {
    if (this.messages.length > 0) return this.messages
    // `conversation.attach` answers only once the machine's socket is up.
    if (this.hostConnection() === undefined) await this.requestHostAttach()
    await this.loadSnapshot()
    return this.messages
  }

  /**
   * A restart is not a reason to call anything again: the machine runs the turn
   * and its `turn.finished` reconciles the rows. The SDK's own
   * partial row would be a second writer, so it neither persists nor continues.
   */
  protected override async onChatRecovery(): Promise<ChatRecoveryOptions> {
    return { persist: false, continue: false }
  }

  /**
   * Attach the hibernated Host socket. No snapshot: a wake is not a reason to
   * rewrite the store. If a turn may still run, drop the SDK's orphaned stream
   * buffer so a later resume ack cannot merge it into the reconciled row.
   */
  override onStart(): void {
    const host = this.hostConnection()
    if (host !== undefined) this.hostSocket.attach(host)
    if (this.state.runningTurnId !== undefined && this._resumableStream.hasActiveStream()) {
      // A resume ack would merge the dead stream's partial into the reconciled row.
      this._resumableStream.clearAll()
    }
  }

  override getConnectionTags(_connection: Connection, context: ConnectionContext): string[] {
    return hasSubprotocol(context.request, HOST_CONVERSATION_SUBPROTOCOL)
      ? [HOST_CONNECTION_TAG]
      : []
  }

  override shouldConnectionBeReadonly(
    _connection: Connection,
    context: ConnectionContext,
  ): boolean {
    return !hasSubprotocol(context.request, HOST_CONVERSATION_SUBPROTOCOL)
  }

  override shouldSendProtocolMessages(
    _connection: Connection,
    context: ConnectionContext,
  ): boolean {
    return !hasSubprotocol(context.request, HOST_CONVERSATION_SUBPROTOCOL)
  }

  /** Keep Agent and AIChat protocol messages off the Host JSON-RPC connection. */
  override broadcast(
    message: string | ArrayBuffer | ArrayBufferView,
    without: string[] = [],
  ): void {
    const excluded = new Set(without)
    for (const connection of this.getConnections(HOST_CONNECTION_TAG)) {
      excluded.add(connection.id)
    }
    super.broadcast(message, [...excluded])
  }

  /** Accept one authenticated Host conversation socket, or answer a viewer's arrival. */
  override async onConnect(connection: Connection, context: ConnectionContext): Promise<void> {
    if (!hasSubprotocol(context.request, HOST_CONVERSATION_SUBPROTOCOL)) {
      // The socket is the transcript's source: seed the screen the way every later
      // persist reaches it. The page turns the SDK's own HTTP seed off for SSR.
      connection.send(JSON.stringify({ type: CHAT_MESSAGES_FRAME, messages: this.messages }))
      this.requestHostAttachInBackground()
      return
    }
    if (
      !admitHostSocket({
        connection,
        request: context.request,
        subprotocol: HOST_CONVERSATION_SUBPROTOCOL,
        previous: this.getConnections(HOST_CONNECTION_TAG),
      })
    ) {
      return
    }
    this.hostSocket.attach(connection)
    const hostId = HostIdSchema.parse(context.request.headers.get(RELAY_HOST_ID_HEADER))
    connection.setState({
      role: 'host-conversation',
      hostId,
      connectedAt: Date.now(),
    } satisfies HostConnectionState)
    this.requestSnapshotInBackground()
  }

  /** Handle Host conversation responses and notifications. */
  override async onMessage(connection: Connection, frame: WSMessage): Promise<void> {
    if (!connection.tags.includes(HOST_CONNECTION_TAG)) return
    const close = await this.hostSocket.handleMessage(connection, frame)
    if (close !== undefined) connection.close(close.code, close.reason)
  }

  override onClose(connection: Connection): void {
    if (!connection.tags.includes(HOST_CONNECTION_TAG)) return
    if (this.hostConnection() !== undefined) return
    this.hostSocket.clear()
  }

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The Agents SDK declares WebSocket errors as unknown.
  override onError(connection: Connection, error: unknown): never
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The Agents SDK declares Agent errors as unknown.
  override onError(error: unknown): never
  /** Log the original SDK error, then preserve the SDK rethrow contract. */
  override onError(...args: [connection: Connection, error: unknown] | [error: unknown]): never {
    rethrowAgentError(logger, args, {
      agentEvent: 'conversation_agent_error',
      hostTag: HOST_CONNECTION_TAG,
      details: { conversationId: this.conversationId },
    })
  }

  /**
   * Ask the Host to start a turn and hand the SDK a stream that the Host's
   * events fill. The stream binds to its turn on `turn.started`.
   */
  override async onChatMessage(
    _onEnd: GenerateTextOnEndCallback,
    _options?: OnChatMessageOptions,
  ): Promise<Response> {
    const userMessage = startableUserMessage(this.messages)
    if (userMessage === undefined) return errorStreamResponse('Enter a prompt or attach a file.')

    const stream = new TransformStream<UIMessageChunk, UIMessageChunk>()
    const active: ActiveStream = {
      binding: 'waiting',
      attemptId: createAttemptId(),
      userMessageId: userMessage.id,
      queuedPosition: userMessage.queuedPosition,
      writer: stream.writable.getWriter(),
      projection: createConversationEventProjectionState(),
    }
    this.activeStream = active
    // The row carries its attempt from the start, so a lost `turn.started` cannot
    // orphan it: snapshots and reconciles match the Host's turn record by attempt.
    await this.persistMessages(
      this.messages.map((row) =>
        row.id === userMessage.id ? { ...row, metadata: { attemptId: active.attemptId } } : row,
      ),
    )
    // Exactly the Host contract: the row's queue position is the relay's own fact.
    void this.startTurn(active, { id: userMessage.id, content: userMessage.content })
    return createUIMessageStreamResponse({ stream: stream.readable })
  }

  /** The turn whose stream just closed; `onChatResponse` reconciles it after the SDK persisted. */
  private reconcileAfterReply: { turnId: TurnId; userMessageId: MessageId } | undefined

  /**
   * After the SDK persisted the assistant row: replace the turn with the Host's
   * version, so Stop, gaps, and reorders all end in the same rows.
   */
  override async onChatResponse(result: ChatResponseResult): Promise<void> {
    void result
    const finished = this.reconcileAfterReply
    if (finished === undefined) return
    this.reconcileAfterReply = undefined
    await this.reconcileTurn(finished.turnId, finished.userMessageId).catch((error) => {
      logger.warn('turn_reconcile_failed', {
        error: toErrorPayload(error),
        details: { conversationId: this.conversationId, turnId: finished.turnId },
      })
    })
  }

  @callable()
  async closeConversation(): Promise<null> {
    return await this.hostSocket.request('conversation.close', {})
  }

  /** Stop is a command to the machine; the stream ends when the Host sends `turn.finished`. */
  @callable()
  async cancelTurn(params: HostConversationMethodMap['turn.cancel']['params']): Promise<null> {
    return await this.hostSocket.request('turn.cancel', params)
  }

  @callable()
  async setConfiguration(
    params: HostConversationMethodMap['conversation.configuration.set']['params'],
  ): Promise<null> {
    return await this.hostSocket.request('conversation.configuration.set', params)
  }

  /** Model and effort travel as one pair, the way ACP's `set_model` takes them. */
  @callable()
  async setModel(
    params: HostConversationMethodMap['conversation.model.set']['params'],
  ): Promise<null> {
    return await this.hostSocket.request('conversation.model.set', params)
  }

  @callable()
  async answerPermission(
    params: HostConversationMethodMap['permission.answer']['params'],
  ): Promise<null> {
    return await this.hostSocket.request('permission.answer', params)
  }

  @callable()
  async answerElicitation(
    params: HostConversationMethodMap['elicitation.answer']['params'],
  ): Promise<null> {
    return await this.hostSocket.request('elicitation.answer', params)
  }

  /** The uncommitted changes, read from git on the machine each time; never cached here. */
  @callable()
  async listChanges(): Promise<UncommittedChanges> {
    return await this.hostSocket.request('changes.list', {})
  }

  /** One changed file's diff, as git prints it. */
  @callable()
  async getDiff(params: HostConversationMethodMap['changes.diff']['params']): Promise<FileDiff> {
    return await this.hostSocket.request('changes.diff', params)
  }

  /** The Host's command list, read once by the composer menu; never part of `state`. */
  @callable()
  async listCommands(): Promise<readonly ConversationCommand[]> {
    return (await this.ctx.storage.get<readonly ConversationCommand[]>(COMMANDS_KEY)) ?? []
  }

  // `onConnect` asks once per Host socket; one snapshot per socket is enough.
  private snapshotInFlight: Promise<void> | undefined

  private requestSnapshotInBackground(): void {
    if (this.snapshotInFlight !== undefined) return
    this.snapshotInFlight = this.loadSnapshot()
      .catch((error) => {
        if (error instanceof HostOfflineError) return
        logger.warn('conversation_get_failed', {
          error: toErrorPayload(error),
          details: { conversationId: this.conversationId },
        })
      })
      .finally(() => {
        this.snapshotInFlight = undefined
      })
  }

  private async loadSnapshot(): Promise<void> {
    await this.applySnapshot(await this.hostSocket.request('conversation.get', {}))
  }

  /**
   * Write every finished turn under the Host's ids. A turn with an open stream
   * keeps its current rows: they are re-supplied unchanged, never omitted,
   * because `persistMessages` deletes what the supplied set lacks.
   */
  private async applySnapshot(
    state: HostConversationMethodMap['conversation.get']['result'],
  ): Promise<void> {
    this.setLiveState(liveStateFromConversation(state))
    if (state.commands !== undefined) {
      await this.ctx.storage.put(COMMANDS_KEY, state.commands)
    }
    let rows = await conversationStateToMessages(state, this.messages)
    const active = this.activeStream
    if (active?.binding === 'bound') {
      // The stream owns its turn: re-supply the current rows unchanged, never omit them: `persistMessages` deletes what the supplied set lacks.
      rows = [
        ...rows.filter((row) => !rowBelongsToTurn(row, active.turnId)),
        ...this.messages.filter((row) => rowBelongsToTurn(row, active.turnId)),
      ]
    }
    // Queued and dequeued rows are the relay's, not the Host's: the snapshot cannot know them.
    rows = [...rows, ...this.messages.filter((row) => isQueuedRow(row) || isDequeuedRow(row))]
    await this.persistMessages(rows, [], { _deleteStaleRows: true })
    this.publishCurrentActivity()
    if (state.turn.state === 'idle') this.drainQueueInBackground()
  }

  /** Replace one finished turn with the Host's version of it. */
  private async reconcileTurn(turnId: TurnId, userMessageId?: MessageId): Promise<void> {
    const turn = await this.hostSocket.request('turn.get', { turnId })
    const rows = await turnToMessages(turn, this.messages, userMessageId)
    const index = this.messages.findIndex((row) => rowBelongsToTurn(row, turnId))
    const kept = this.messages.filter((row) => !rowBelongsToTurn(row, turnId))
    const at = index === -1 ? kept.length : index
    await this.persistMessages([...kept.slice(0, at), ...rows, ...kept.slice(at)], [], {
      _deleteStaleRows: true,
    })
  }

  private async acceptEvent(event: ConversationEvent): Promise<void> {
    this.setLiveState(reduceLiveState(this.state, event))
    this.publishActivity(event)
    if (event.type === 'conversation.commands.updated') {
      await this.ctx.storage.put(COMMANDS_KEY, event.commands)
    }
    if (event.type === 'turn.started') await this.bindStream(event)
    // The queue waits for the SDK's own turn to settle, so this is safe before the stream closes.
    if (isTerminalEvent(event)) this.drainQueueInBackground()
    const active = this.activeStream
    if (active?.binding !== 'bound' || !eventBelongsToTurn(event, active.turnId)) {
      if (isTerminalEvent(event) && 'turnId' in event) this.reconcileInBackground(event.turnId)
      return
    }
    await this.serializeStream(async () => {
      if (this.activeStream !== active) return
      try {
        await writeChunks(active.writer, eventProjector.project(event, active.projection))
      } catch (error) {
        logger.warn('conversation_stream_detached', {
          error: toErrorPayload(error),
          details: { conversationId: this.conversationId, turnId: active.turnId },
        })
        this.activeStream = undefined
        return
      }
      if (!isTerminalEvent(event)) return
      // `onChatResponse` reconciles after `_reply` has persisted the streamed row.
      this.reconcileAfterReply = { turnId: active.turnId, userMessageId: active.userMessageId }
      this.activeStream = undefined
      await active.writer.close().catch(() => undefined)
    })
  }

  /** `turn.started` names the turn an attempt asked for; the stream may already be gone. */
  private async bindStream(
    event: Extract<ConversationEvent, { type: 'turn.started' }>,
  ): Promise<void> {
    const active = this.activeStream
    if (active?.binding === 'waiting' && active.attemptId === event.attemptId) {
      this.activeStream = { ...active, binding: 'bound', turnId: event.turnId }
    }
    // Upgrade the attempt stamp to the turn link. The relay owns this metadata.
    await this.persistMessages(
      this.messages.map((row) =>
        attemptIdOfRow(row) === event.attemptId
          ? { ...row, metadata: { turnId: event.turnId, attemptId: event.attemptId } }
          : row,
      ),
    )
  }

  /** `setState` writes and broadcasts the whole value; call it only for a new reference. */
  private setLiveState(next: ConversationLiveState): void {
    if (next !== this.state) this.setState(next)
  }

  private reconcileInBackground(turnId: TurnId): void {
    void this.reconcileTurn(turnId).catch((error) => {
      logger.warn('turn_reconcile_failed', {
        error: toErrorPayload(error),
        details: { conversationId: this.conversationId, turnId },
      })
    })
  }

  private async startTurn(
    active: ActiveStream,
    userMessage: { readonly id: MessageId; readonly content: CanonicalContent[] },
  ): Promise<void> {
    try {
      await this.hostSocket.request('turn.start', { attemptId: active.attemptId, userMessage })
    } catch (error) {
      logger.error('turn_start_failed', {
        error,
        details: { conversationId: this.conversationId, attemptId: active.attemptId },
      })
      if (this.activeStream !== active) return
      this.activeStream = undefined
      // A queued row goes back to the queue; a browser send stays a failed send, as today.
      if (active.queuedPosition !== undefined) {
        const position = active.queuedPosition
        await this.persistMessages(
          this.messages.map((row) =>
            row.id === active.userMessageId
              ? { ...row, metadata: queuedRowMetadata(position) }
              : row,
          ),
        )
      }
      await closeWriterWithError(active.writer, hostErrorMessage(error))
    }
  }

  // --- Queue: rows the relay holds back until the running turn ends -------------------------

  /** Persist a queued user row; it starts when no turn runs. */
  @callable()
  async queueMessage(input: QueueMessageInput): Promise<null> {
    const { id, parts } = QueueMessageInputSchema.parse(input)
    const row: UIMessage = {
      id,
      role: 'user',
      metadata: queuedRowMetadata(nextQueuePosition(this.messages)),
      parts: parts.map(toUserPart),
    }
    await this.persistMessages([...this.messages, row])
    this.drainQueueInBackground()
    return null
  }

  /** Delete a queued row. A row that already started is a no-op: start and withdraw race, and start wins. */
  @callable()
  async withdrawQueued(ref: QueuedMessageRef): Promise<null> {
    const { messageId } = QueuedMessageRefSchema.parse(ref)
    const row = this.messages.find((entry) => entry.id === messageId)
    if (row === undefined || !isQueuedRow(row)) return null
    await this.persistMessages(
      this.messages.filter((entry) => entry.id !== messageId),
      [],
      { _deleteStaleRows: true },
    )
    return null
  }

  /** Move a queued row to a 1-based position among the queued rows; the others shift. */
  @callable()
  async reorderQueued(input: ReorderQueuedInput): Promise<null> {
    const { messageId, position } = ReorderQueuedInputSchema.parse(input)
    const queued = queuedRows(this.messages)
    const from = queued.findIndex((row) => row.id === messageId)
    if (from === -1) return null
    const moved = queued[from]
    if (moved === undefined) return null
    const rest = queued.filter((row) => row.id !== messageId)
    const at = Math.min(position - 1, rest.length)
    const ordered = [...rest.slice(0, at), moved, ...rest.slice(at)]
    const positions = new Map(ordered.map((row, index) => [row.id, index + 1]))
    await this.persistMessages(
      this.messages.map((row) => {
        const next = positions.get(row.id)
        return next === undefined ? row : { ...row, metadata: queuedRowMetadata(next) }
      }),
    )
    return null
  }

  /**
   * Start one queued row next, alone. Cancels the running turn; the drain
   * that follows `turn.finished` reads the marker. With no turn running the
   * drain starts at once.
   */
  @callable()
  async sendQueuedNow(ref: QueuedMessageRef): Promise<null> {
    const { messageId } = QueuedMessageRefSchema.parse(ref)
    const row = this.messages.find((entry) => entry.id === messageId)
    if (row === undefined || !isQueuedRow(row)) return null
    await this.ctx.storage.put(SEND_NOW_KEY, messageId)
    const turnId = this.state.runningTurnId
    if (turnId !== undefined) return await this.hostSocket.request('turn.cancel', { turnId })
    this.drainQueueInBackground()
    return null
  }

  // One drain at a time: every trigger while one waits is covered by that one.
  private draining = false

  private drainQueueInBackground(): void {
    if (this.draining) return
    this.draining = true
    void this.drainQueue()
      .catch((error) => {
        logger.warn('queue_drain_failed', {
          error: toErrorPayload(error),
          details: { conversationId: this.conversationId },
        })
      })
      .finally(() => {
        this.draining = false
      })
  }

  /**
   * Start the next turn from the queue once nothing runs: the SDK's turn has
   * settled and the Host reports no running turn. One row per turn, in run
   * order, unless `sendQueuedNow` named the row. The drain after that turn's
   * end takes the next one.
   *
   * `saveMessages` resolves when the whole turn ends, so it is not awaited here.
   * Its callback runs when the SDK is ready to start; if the queue changed
   * meanwhile and nothing is left to start, the signal aborts the turn before
   * any work runs.
   */
  private async drainQueue(): Promise<void> {
    const stable = await this.waitUntilStable({ timeout: DRAIN_STABLE_TIMEOUT_MS })
    if (!stable || this.state.runningTurnId !== undefined) return
    const queued = queuedRows(this.messages)
    if (queued.length === 0) return
    const sendNow = await this.ctx.storage.get<MessageId>(SEND_NOW_KEY)
    await this.ctx.storage.delete(SEND_NOW_KEY)

    // One message, one turn: the Send now row if any, else the first in run order.
    const chosen = queued.find((row) => row.id === sendNow) ?? queued[0]
    if (chosen === undefined) return
    const position = queuedPositionOfRow(chosen) ?? 0
    // The store orders rows by creation. A row queued mid-turn predates the answer it
    // waited for, so it is deleted and written again to take its place after that answer.
    await this.persistMessages(
      this.messages.filter((row) => row.id !== chosen.id),
      [],
      { _deleteStaleRows: true },
    )
    await this.persistMessages([
      ...this.messages,
      { ...chosen, metadata: dequeuedRowMetadata(position) },
    ])

    // The turn starts when the SDK is ready; if the row was withdrawn by then, no turn runs.
    const nothingToStart = new AbortController()
    void this.saveMessages(
      (rows) => {
        if (nextUserRow(rows) === undefined) nothingToStart.abort()
        return [...rows]
      },
      { signal: nothingToStart.signal },
    )
      .then((result) => {
        if (result.status !== 'completed' && result.status !== 'aborted') {
          logger.warn('queue_turn_not_completed', {
            details: { conversationId: this.conversationId, status: result.status },
          })
        }
        return result
      })
      .catch((error) => {
        logger.warn('queue_turn_failed', {
          error: toErrorPayload(error),
          details: { conversationId: this.conversationId },
        })
      })
  }

  private serializeStream<Result>(work: () => Promise<Result>): Promise<Result> {
    const result = this.streamWork.then(work, work)
    this.streamWork = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private publishCurrentActivity(): void {
    if (this.state.runningTurnId === undefined) {
      this.publishClearActivity()
      return
    }
    this.publishActivityRecord(this.state.runningTurnId)
  }

  private publishActivity(event: ConversationEvent): void {
    if (event.type === 'turn.started') {
      this.publishActivityRecord(event.turnId)
      return
    }
    if (event.type === 'message.started' && event.role === 'assistant') {
      this.publishActivityRecord(event.turnId)
      return
    }
    if (isTerminalEvent(event)) this.publishClearActivity()
  }

  /**
   * A viewer is here, so ask for the machine unless this Agent already has it.
   *
   * Off the connect path on purpose: the ask spawns a session on the machine, and a
   * viewer that cannot reach one still reads what this Agent already stored.
   */
  private requestHostAttachInBackground(): void {
    if (this.hostConnection() !== undefined) return
    void this.requestHostAttach().catch((error) => {
      // An away machine is what the status dot already reports, so it is not a fault here.
      if (error instanceof HostOfflineError) return
      logger.warn('conversation_attach_failed', {
        error: toErrorPayload(error),
        details: { conversationId: this.conversationId },
      })
    })
  }

  /** The parent owns the control socket, so the ask for a machine goes through it. */
  private async requestHostAttach(): Promise<void> {
    const parent = await this.parentAgent(HostRelayAgent)
    await parent.attachConversation(this.conversationId)
  }

  private hostConnection(): Connection | undefined {
    return openHostConnection(this.getConnections(HOST_CONNECTION_TAG))
  }

  private publishActivityRecord(turnId: TurnId): void {
    void this.parentAgent(HostRelayAgent)
      .then((parent) =>
        parent.setConversationActivity({
          conversationId: this.conversationId,
          turnId,
          hasAssistantMessage: this.messages.some(
            (message) => message.role === 'assistant' && message.id === turnId,
          ),
        }),
      )
      .catch((error) => {
        logger.error('conversation_activity_failed', { error })
      })
  }

  private publishClearActivity(): void {
    void this.parentAgent(HostRelayAgent)
      .then((parent) => parent.clearConversationActivity(this.conversationId))
      .catch((error) => {
        logger.error('conversation_activity_failed', { error })
      })
  }
}

/**
 * The user message this chat turn starts, in the Host's content shape.
 *
 * A browser send and a drained queue row both arrive as the first user row
 * with no turn link. A row with nothing the Host can read is not startable.
 */
function startableUserMessage(messages: readonly UIMessage[]):
  | {
      readonly id: MessageId
      readonly content: CanonicalContent[]
      readonly queuedPosition: number | undefined
    }
  | undefined {
  const message = nextUserRow(messages)
  if (message === undefined) return undefined
  const messageId = MessageIdSchema.parse(message.id)
  const content = message.parts.flatMap((part, index) => {
    if (part.type === 'text') return [{ type: 'text', text: part.text } satisfies CanonicalContent]
    if (part.type !== 'file') return []
    return [canonicalFileContent(messageId, index, part)]
  })
  if (content.length === 0) return undefined
  return { id: messageId, content, queuedPosition: dequeuedPositionOfRow(message) }
}

function canonicalFileContent(
  messageId: MessageId,
  index: number,
  part: Extract<UIMessage['parts'][number], { type: 'file' }>,
): CanonicalContent {
  const data = /^data:([^;,]+);base64,(.*)$/s.exec(part.url)
  if (data !== null && part.mediaType.startsWith('image/')) {
    return { type: 'image', mimeType: part.mediaType, data: data[2] ?? '' }
  }
  if (data !== null && part.mediaType.startsWith('audio/')) {
    return { type: 'audio', mimeType: part.mediaType, data: data[2] ?? '' }
  }
  if (data !== null) {
    return {
      type: 'resource',
      resource: {
        uri: `urn:porte:${messageId}:${index}`,
        mimeType: part.mediaType,
        content: { type: 'blob', data: data[2] ?? '' },
      },
    }
  }
  return {
    type: 'resource-link',
    uri: part.url,
    name: part.filename ?? `Attachment ${index + 1}`,
    mimeType: part.mediaType,
  }
}

/** The next free run position: after the last queued row. */
function nextQueuePosition(messages: readonly UIMessage[]): number {
  const last = queuedRows(messages).at(-1)
  return last === undefined ? 1 : (queuedPositionOfRow(last) ?? 0) + 1
}

/** The parsed part back into the AI SDK's own shape, without the optional key when absent. */
function toUserPart(part: z.infer<typeof QueuedPartSchema>): UIMessage['parts'][number] {
  if (part.type === 'text') return { type: 'text', text: part.text }
  return part.filename === undefined
    ? { type: 'file', mediaType: part.mediaType, url: part.url }
    : { type: 'file', mediaType: part.mediaType, url: part.url, filename: part.filename }
}

function errorStreamResponse(message: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'error', errorText: message })
    },
  })
  return createUIMessageStreamResponse({ stream })
}

async function writeChunks(
  writer: WritableStreamDefaultWriter<UIMessageChunk>,
  chunks: readonly UIMessageChunk[],
): Promise<void> {
  for (const chunk of chunks) {
    // oxlint-disable-next-line no-await-in-loop -- The AI SDK stream keeps projector order.
    await writer.write(chunk)
  }
}

async function closeWriterWithError(
  writer: WritableStreamDefaultWriter<UIMessageChunk>,
  message: string,
): Promise<void> {
  try {
    await writer.write({ type: 'error', errorText: message })
    await writer.close()
  } catch {
    await writer.abort().catch(() => undefined)
  }
}

function eventBelongsToTurn(event: ConversationEvent, turnId: TurnId): boolean {
  return event.type === 'conversation.failed' || ('turnId' in event && event.turnId === turnId)
}

/** A row is the turn's assistant row (`id = turnId`) or carries the turn in its metadata. */
function rowBelongsToTurn(row: UIMessage, turnId: TurnId): boolean {
  return row.id === turnId || turnIdOfRow(row) === turnId
}

function isTerminalEvent(event: ConversationEvent): boolean {
  return event.type === 'turn.finished' || event.type === 'conversation.failed'
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch values have no declared runtime type.
function hostErrorMessage(error: unknown): string {
  if (error instanceof HostOfflineError) return 'Your machine is offline.'
  if (error instanceof ConversationBusyError) return 'A turn is already running.'
  return 'The conversation could not start.'
}
