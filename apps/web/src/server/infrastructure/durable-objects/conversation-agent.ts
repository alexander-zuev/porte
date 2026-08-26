import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat'
import {
  ConversationBusyError,
  ConversationIdSchema,
  HOST_CONVERSATION_SUBPROTOCOL,
  HostConversationMethods,
  HostIdSchema,
  HostOfflineError,
  INITIAL_CONVERSATION_RELAY_STATE,
  MessageIdSchema,
  conversationRelayStateFromState,
  createLogger,
  createTurnId,
  reduceConversationRelayState,
  type CanonicalContent,
  type ConversationEvent,
  type ConversationId,
  type ConversationRelayState,
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
import { conversationStateToMessages } from '@web/lib/conversation/conversation-state-messages.ts'
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

type HostConnectionState = {
  readonly role: 'host-conversation'
  readonly hostId: HostId
  readonly connectedAt: number
}

type ActiveStream = {
  readonly turnId: TurnId
  readonly writer: WritableStreamDefaultWriter<UIMessageChunk>
  readonly projection: ConversationEventProjectionState
}

/** Child chat Agent for one conversation data connection. */
export class ConversationAgent extends AIChatAgent<RuntimeEnv, ConversationRelayState> {
  initialState: ConversationRelayState = INITIAL_CONVERSATION_RELAY_STATE
  chatRecovery = true

  private readonly conversationId: ConversationId
  private readonly hostSocket: HostJsonRpcSocket<typeof HostConversationMethods>
  private activeStream: ActiveStream | undefined
  private streamWork: Promise<void> = Promise.resolve()
  private hasAssistantMessage = false

  constructor(ctx: AgentContext, env: RuntimeEnv) {
    super(ctx, env)
    this.conversationId = ConversationIdSchema.parse(this.name)
    this.hostSocket = new HostJsonRpcSocket({
      methods: HostConversationMethods,
      notificationHandlers: {
        'conversation.event': (params) => this.handleConversationEvent(params),
      },
    })
  }

  override onStart(): void {
    const host = this.hostConnection()
    if (host === undefined) return
    this.hostSocket.attach(host)
    this.requestSnapshotInBackground()
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

  /** Start a Host turn and stream its ordered events to AIChatAgent. */
  override async onChatMessage(
    _onEnd: GenerateTextOnEndCallback,
    options?: OnChatMessageOptions,
  ): Promise<Response> {
    const userMessage = latestUserMessage(this.messages)
    if (userMessage === undefined) return errorStreamResponse('Enter a prompt or attach a file.')

    let turnId: TurnId
    if (options?.continuation) {
      if (this.state.runningTurnId === undefined) {
        return errorStreamResponse('The turn is no longer available for recovery.')
      }
      turnId = this.state.runningTurnId
    } else {
      turnId = createTurnId()
      this.setState({ ...this.state, runningTurnId: turnId })
    }
    const stream = new TransformStream<UIMessageChunk, UIMessageChunk>()
    const active = {
      turnId,
      writer: stream.writable.getWriter(),
      projection: createConversationEventProjectionState(this.messages),
    } satisfies ActiveStream
    this.activeStream = active
    const abort = (): void => {
      if (this.activeStream === active) this.activeStream = undefined
      void active.writer.close().catch(() => undefined)
      this.cancelTurnInBackground(turnId)
    }
    if (options?.abortSignal?.aborted) abort()
    else options?.abortSignal?.addEventListener('abort', abort, { once: true })
    void this.startTurn(active, userMessage)
    return createUIMessageStreamResponse({ stream: stream.readable })
  }

  @callable()
  async closeConversation(): Promise<null> {
    return await this.hostSocket.request('conversation.close', {})
  }

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

  private requestSnapshotInBackground(): void {
    void this.loadSnapshot().catch((error) => {
      if (error instanceof HostOfflineError) return
      logger.warn('conversation_get_failed', {
        error: toErrorPayload(error),
        details: { conversationId: this.conversationId },
      })
    })
  }

  private async loadSnapshot(): Promise<void> {
    await this.applySnapshot(await this.hostSocket.request('conversation.get', {}))
  }

  private async applySnapshot(
    state: HostConversationMethodMap['conversation.get']['result'],
  ): Promise<void> {
    this.setState(conversationRelayStateFromState(state))
    await this.persistMessages(await conversationStateToMessages(state), [], {
      _deleteStaleRows: true,
    })
    this.publishCurrentActivity()
  }

  private async handleConversationEvent(
    params: HostConversationMethodMap['conversation.event']['params'],
  ): Promise<void> {
    await this.acceptEvent(params.event)
  }

  private async acceptEvent(event: ConversationEvent): Promise<void> {
    this.setState(reduceConversationRelayState(this.state, event))
    this.publishActivity(event)
    const active = this.activeStream
    if (active === undefined || !eventBelongsToTurn(event, active.turnId)) return
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

  private async startTurn(
    active: ActiveStream,
    userMessage: { readonly id: MessageId; readonly content: CanonicalContent[] },
  ): Promise<void> {
    try {
      await this.hostSocket.request('turn.start', { turnId: active.turnId, userMessage })
    } catch (error) {
      logger.error('turn_start_failed', {
        error,
        details: { conversationId: this.conversationId, turnId: active.turnId },
      })
      if (this.activeStream !== active) return
      this.activeStream = undefined
      await closeWriterWithError(active.writer, hostErrorMessage(error))
    }
  }

  private cancelTurnInBackground(turnId: TurnId): void {
    void this.cancelTurn({ turnId }).catch((error) => {
      logger.error('turn_cancel_failed', {
        error,
        details: { conversationId: this.conversationId, turnId },
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
      this.hasAssistantMessage = false
      this.publishActivityRecord(event.turnId)
      return
    }
    if (event.type === 'message.started' && event.role === 'assistant') {
      this.hasAssistantMessage = true
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
          hasAssistantMessage: this.hasAssistantMessage,
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
