import {
  AIChatAgent,
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
  notYetImplemented,
  reduceLiveState,
  type AttemptId,
  type CanonicalContent,
  type ConversationCommand,
  type ConversationEvent,
  type ConversationId,
  type ConversationLiveState,
  type HostConversationMethodMap,
  type HostId,
  type MessageId,
  type TurnId,
} from '@porte/core'
import { toErrorPayload } from '@server/infrastructure/errors/to-error-payload.ts'
import type { RuntimeEnv } from '@server/infrastructure/runtime-env.ts'
import {
  ConversationEventProjector,
  createConversationEventProjectionState,
  type ConversationEventProjectionState,
} from '@web/lib/conversation/conversation-event-projector.ts'
import {
  conversationStateToMessages,
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

// oxlint-disable-next-line import/no-cycle -- The Agents SDK resolves the runtime parent class.
import { HostRelayAgent } from './host-relay-agent.ts'
import { HostJsonRpcSocket } from './relay/host-json-rpc-socket.ts'
import { admitHostSocket, hasSubprotocol, openHostConnection } from './relay/host-subprotocol.ts'
import { RELAY_HOST_ID_HEADER } from './relay/relay-headers.ts'
import { rethrowAgentError } from './relay/rethrow-agent-error.ts'

const logger = createLogger('conversation-agent')
/** Holds no state of its own: every call takes the projection it works on. */
const eventProjector = new ConversationEventProjector()
const HOST_CONNECTION_TAG = 'host-conversation'
/** DO storage key for the Host's command list; too big for `state` (plan §5.8). */
const COMMANDS_KEY = 'commands'

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
      readonly writer: WritableStreamDefaultWriter<UIMessageChunk>
      readonly projection: ConversationEventProjectionState
    }
  | {
      readonly binding: 'bound'
      readonly attemptId: AttemptId
      readonly turnId: TurnId
      readonly writer: WritableStreamDefaultWriter<UIMessageChunk>
      readonly projection: ConversationEventProjectionState
    }

/**
 * Child chat Agent for one conversation data connection.
 *
 * Owns a projection, never the truth: the Mac runs the turn and keeps the
 * transcript. The stream writes the running turn; snapshots and the per-turn
 * reconcile write finished turns under the Host's ids (plan §5.2).
 */
export class ConversationAgent extends AIChatAgent<RuntimeEnv, ConversationLiveState> {
  initialState: ConversationLiveState = INITIAL_CONVERSATION_LIVE_STATE
  /** The SDK's "call the model again" recovery is wrong here: the Mac runs the turn (plan §5.5). */
  chatRecovery = false

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
      // TODO(step 3): persist the last applied `seq` per Host connection in DO storage.
      sequence: {
        load: () => notYetImplemented('step 3'),
        save: () => notYetImplemented('step 3'),
      },
    })
  }

  /**
   * Attach the hibernated Host socket. No snapshot: a wake is not a reason to
   * rewrite the store. If a turn may still run, drop the SDK's orphaned stream
   * buffer so a later resume ack cannot merge it into the reconciled row.
   */
  override onStart(): void {
    const host = this.hostConnection()
    if (host !== undefined) this.hostSocket.attach(host)
    // TODO(step 3): if `state.runningTurnId` is set and the SDK reports an active stream, clear the buffer.
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
    const userMessage = latestUserMessage(this.messages)
    if (userMessage === undefined) return errorStreamResponse('Enter a prompt or attach a file.')

    const stream = new TransformStream<UIMessageChunk, UIMessageChunk>()
    const active: ActiveStream = {
      binding: 'waiting',
      attemptId: createAttemptId(),
      writer: stream.writable.getWriter(),
      projection: createConversationEventProjectionState(),
    }
    this.activeStream = active
    void this.startTurn(active, userMessage)
    return createUIMessageStreamResponse({ stream: stream.readable })
  }

  /**
   * After the SDK persisted the assistant row: replace the turn with the Host's
   * version, so Stop, gaps, and reorders all end in the same rows (plan §5.2).
   */
  override async onChatResponse(result: ChatResponseResult): Promise<void> {
    // TODO(step 3): find the turn this request streamed and `reconcileTurn` it.
    void result
    notYetImplemented('step 3')
  }

  @callable()
  async closeConversation(): Promise<null> {
    return await this.hostSocket.request('conversation.close', {})
  }

  /** Stop is a command to the Mac; the stream ends when the Host sends `turn.finished`. */
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

  /** The Host's command list, read once by the composer menu; never part of `state`. */
  @callable()
  async listCommands(): Promise<readonly ConversationCommand[]> {
    // TODO(step 3): `this.ctx.storage.get(COMMANDS_KEY)` with an empty default.
    void COMMANDS_KEY
    return notYetImplemented('step 3')
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
    // TODO(step 3): keep the streaming turn's rows from `this.messages`; store `state.commands` under COMMANDS_KEY.
    await this.persistMessages(await conversationStateToMessages(state, this.messages), [], {
      _deleteStaleRows: true,
    })
    this.publishCurrentActivity()
  }

  /** Replace one finished turn with the Host's version of it. */
  private async reconcileTurn(turnId: TurnId): Promise<void> {
    const turn = await this.hostSocket.request('turn.get', { turnId })
    const rows = await turnToMessages(turn, this.messages)
    // TODO(step 3): splice `rows` over the turn's current rows and persist with `_deleteStaleRows`.
    void rows
    notYetImplemented('step 3')
  }

  private async acceptEvent(event: ConversationEvent): Promise<void> {
    this.setLiveState(reduceLiveState(this.state, event))
    this.publishActivity(event)
    if (event.type === 'turn.started') this.bindStream(event)
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
      this.activeStream = undefined
      await active.writer.close().catch(() => undefined)
    })
  }

  /** `turn.started` names the turn the waiting stream asked for. */
  private bindStream(event: Extract<ConversationEvent, { type: 'turn.started' }>): void {
    const active = this.activeStream
    if (active?.binding !== 'waiting' || active.attemptId !== event.attemptId) return
    this.activeStream = { ...active, binding: 'bound', turnId: event.turnId }
    // TODO(step 3): stamp `metadata.turnId` on the user row this attempt sent.
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
      await closeWriterWithError(active.writer, hostErrorMessage(error))
    }
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
   * A viewer is here, so ask for the Mac unless this Agent already has it.
   *
   * Off the connect path on purpose: the ask spawns a session on the Mac, and a
   * viewer that cannot reach one still reads what this Agent already stored.
   */
  private requestHostAttachInBackground(): void {
    if (this.hostConnection() !== undefined) return
    void this.requestHostAttach().catch((error) => {
      // An away Mac is what the status dot already reports, so it is not a fault here.
      if (error instanceof HostOfflineError) return
      logger.warn('conversation_attach_failed', {
        error: toErrorPayload(error),
        details: { conversationId: this.conversationId },
      })
    })
  }

  /** The parent owns the control socket, so the ask for a Mac goes through it. */
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

function latestUserMessage(
  messages: readonly UIMessage[],
): { readonly id: MessageId; readonly content: CanonicalContent[] } | undefined {
  const message = messages.findLast((entry) => entry.role === 'user')
  if (message === undefined) return undefined
  const messageId = MessageIdSchema.parse(message.id)
  const content = message.parts.flatMap((part, index) => {
    if (part.type === 'text') return [{ type: 'text', text: part.text } satisfies CanonicalContent]
    if (part.type !== 'file') return []
    return [canonicalFileContent(messageId, index, part)]
  })
  return content.length === 0 ? undefined : { id: messageId, content }
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

function isTerminalEvent(event: ConversationEvent): boolean {
  return event.type === 'turn.finished' || event.type === 'conversation.failed'
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch values have no declared runtime type.
function hostErrorMessage(error: unknown): string {
  if (error instanceof HostOfflineError) return 'The Mac host is offline.'
  if (error instanceof ConversationBusyError) return 'A turn is already running.'
  return 'The conversation could not start.'
}
