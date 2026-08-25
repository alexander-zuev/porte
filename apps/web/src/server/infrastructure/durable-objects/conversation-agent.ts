import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat'
import {
  ConfigurationNotFoundError,
  ConversationBusyError,
  ConversationIdSchema,
  ConversationNotFoundError,
  ElicitationNotFoundError,
  HOST_CONVERSATION_SUBPROTOCOL,
  HostConversationMethods,
  HostIdSchema,
  HostOfflineError,
  INITIAL_CONVERSATION_RELAY_STATE,
  InternalServerError,
  MessageIdSchema,
  PermissionNotFoundError,
  RequestTimeoutError,
  conversationRelayStateFromState,
  HostRequestIdSchema,
  JsonRpcReadError,
  JsonRpcTextSchema,
  createLogger,
  createTurnId,
  readJsonRpcIncoming,
  readJsonRpcTextFrame,
  reduceConversationRelayState,
  sendJsonRpcFrame,
  type CanonicalContent,
  type ConversationEvent,
  type ConversationId,
  type ConversationRelayState,
  type HostConversationMethodMap,
  type HostId,
  type JsonRpcInboundNotification,
  type JsonRpcParams,
  type MessageId,
  type TurnId,
} from '@porte/core'
import { toErrorPayload } from '@server/infrastructure/errors/to-error-payload.ts'
import type { RuntimeEnv } from '@server/infrastructure/runtime-env.ts'
import {
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
import { z } from 'zod'

import {
  createConversationAgentResources,
  type ConversationAgentResources,
} from './conversation-agent-resources.ts'
// oxlint-disable-next-line import/no-cycle -- The Agents SDK resolves the runtime parent class.
import { HostRelayAgent } from './host-relay-agent.ts'
import {
  HostApplicationResponseError,
  HostConnectionUnavailableError,
  HostJsonRpcRequests,
  HostRequestTimeoutError,
} from './relay/host-json-rpc-requests.ts'
import { RELAY_HOST_ID_HEADER } from './relay/relay-headers.ts'

const logger = createLogger('conversation-agent')
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
  static options = { hibernate: false }

  initialState: ConversationRelayState = INITIAL_CONVERSATION_RELAY_STATE
  chatRecovery = true

  private readonly conversationId: ConversationId
  private readonly resources: ConversationAgentResources
  private readonly requests: HostJsonRpcRequests
  private activeStream: ActiveStream | undefined
  private streamWork: Promise<void> = Promise.resolve()
  private hasAssistantMessage = false

  constructor(ctx: AgentContext, env: RuntimeEnv) {
    super(ctx, env)
    this.conversationId = ConversationIdSchema.parse(this.name)
    this.resources = createConversationAgentResources(() => this.parentAgent(HostRelayAgent))
    this.requests = new HostJsonRpcRequests((frame) => this.sendHostFrame(frame))
  }

  override getConnectionTags(_connection: Connection, context: ConnectionContext): string[] {
    return isHostConnection(context.request) ? [HOST_CONNECTION_TAG] : []
  }

  override shouldConnectionBeReadonly(
    _connection: Connection,
    context: ConnectionContext,
  ): boolean {
    return !isHostConnection(context.request)
  }

  override shouldSendProtocolMessages(
    _connection: Connection,
    context: ConnectionContext,
  ): boolean {
    return !isHostConnection(context.request)
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

  /** Accept one authenticated Host conversation socket. */
  override onConnect(connection: Connection, context: ConnectionContext): void {
    if (!isHostConnection(context.request)) return
    const hostId = HostIdSchema.safeParse(context.request.headers.get(RELAY_HOST_ID_HEADER))
    if (!hostId.success || !hasSubprotocol(context.request, HOST_CONVERSATION_SUBPROTOCOL)) {
      connection.close(1008, 'invalid host conversation connection')
      return
    }
    connection.setState({
      role: 'host-conversation',
      hostId: hostId.data,
      connectedAt: Date.now(),
    } satisfies HostConnectionState)
    for (const previous of this.getConnections(HOST_CONNECTION_TAG)) {
      if (previous.id !== connection.id) previous.close(1008, 'host conversation replaced')
    }
  }

  /** Handle Host conversation responses and notifications. */
  override async onMessage(connection: Connection, frame: WSMessage): Promise<void> {
    if (!connection.tags.includes(HOST_CONNECTION_TAG)) return
    const parsedFrame = readJsonRpcTextFrame(JsonRpcTextSchema.safeParse(frame))
    if (!parsedFrame.ok) {
      logger.warn('websocket_frame_rejected', {
        details: { code: parsedFrame.close.code, reason: parsedFrame.close.reason },
      })
      connection.close(parsedFrame.close.code, parsedFrame.close.reason)
      return
    }
    try {
      const incoming = readJsonRpcIncoming(
        parsedFrame.frame,
        HostConversationMethods,
        HostRequestIdSchema,
      )
      if (incoming.kind === 'response') {
        if (this.requests.accept(incoming.data)) return
        connection.close(1007, 'unexpected conversation document')
        return
      }
      if (incoming.kind === 'notification') {
        await this.applyNotification(incoming.data)
        return
      }
      connection.close(1007, 'unexpected conversation document')
    } catch (cause) {
      if (cause instanceof JsonRpcReadError) {
        connection.close(1007, 'invalid JSON-RPC document')
        return
      }
      throw cause
    }
  }

  override onClose(connection: Connection): void {
    if (!connection.tags.includes(HOST_CONNECTION_TAG) || this.hostConnection() !== undefined)
      return
    this.requests.close()
  }

  /** Start a Host turn and stream its ordered events to AIChatAgent. */
  override async onChatMessage(
    _onEnd: GenerateTextOnEndCallback,
    options?: OnChatMessageOptions,
  ): Promise<Response> {
    const currentTurn = this.state.status === 'ready' ? this.state.turn : { state: 'idle' as const }
    const userMessage = latestUserMessage(this.messages)
    if (userMessage === undefined) return errorStreamResponse('Enter a prompt or attach a file.')

    let turnId: TurnId
    if (options?.continuation) {
      if (currentTurn.state !== 'running') {
        return errorStreamResponse('The turn is no longer available for recovery.')
      }
      turnId = currentTurn.turnId
    } else {
      turnId = createTurnId()
    }
    const stream = new TransformStream<UIMessageChunk, UIMessageChunk>()
    const active = {
      turnId,
      writer: stream.writable.getWriter(),
      projection: createConversationEventProjectionState(
        this.state.status === 'ready' ? this.state : undefined,
      ),
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
    return await this.requestHost(
      'conversation.close',
      {},
      HostConversationMethods['conversation.close'].result,
    )
  }

  @callable()
  async cancelTurn(params: HostConversationMethodMap['turn.cancel']['params']): Promise<null> {
    return await this.requestHost(
      'turn.cancel',
      params,
      HostConversationMethods['turn.cancel'].result,
    )
  }

  @callable()
  async setConfiguration(
    params: HostConversationMethodMap['conversation.configuration.set']['params'],
  ): Promise<null> {
    return await this.requestHost(
      'conversation.configuration.set',
      params,
      HostConversationMethods['conversation.configuration.set'].result,
    )
  }

  @callable()
  async answerPermission(
    params: HostConversationMethodMap['permission.answer']['params'],
  ): Promise<null> {
    return await this.requestHost(
      'permission.answer',
      params,
      HostConversationMethods['permission.answer'].result,
    )
  }

  @callable()
  async answerElicitation(
    params: HostConversationMethodMap['elicitation.answer']['params'],
  ): Promise<null> {
    return await this.requestHost(
      'elicitation.answer',
      params,
      HostConversationMethods['elicitation.answer'].result,
    )
  }

  private async applyNotification(
    notification: JsonRpcInboundNotification<typeof HostConversationMethods>,
  ): Promise<void> {
    if (notification.method === 'conversation.state') {
      const state = notification.params.state
      this.setState(conversationRelayStateFromState(state))
      await this.persistMessages(await conversationStateToMessages(state), [], {
        _deleteStaleRows: true,
      })
      this.publishCurrentActivity()
      return
    }
    await this.acceptEvent(notification.params.event)
  }

  private async acceptEvent(event: ConversationEvent): Promise<void> {
    this.setState(reduceConversationRelayState(this.state, event))
    this.publishActivity(event)
    const active = this.activeStream
    if (active === undefined || !eventBelongsToTurn(event, active.turnId)) return
    await this.serializeStream(async () => {
      if (this.activeStream !== active) return
      try {
        await writeChunks(
          active.writer,
          this.resources.eventProjector.project(event, active.projection),
        )
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
      await this.requestHost(
        'turn.start',
        { turnId: active.turnId, userMessage },
        HostConversationMethods['turn.start'].result,
      )
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

  private async requestHost<Result>(
    method: string,
    params: JsonRpcParams,
    resultSchema: z.ZodType<Result>,
  ): Promise<Result> {
    try {
      return await this.requests.request(method, params, resultSchema)
    } catch (error) {
      return throwHostError(error)
    }
  }

  private async sendHostFrame(frame: string): Promise<void> {
    const host = this.hostConnection()
    if (host === undefined) throw new HostOfflineError()
    await sendJsonRpcFrame(() => {
      if (host.readyState !== WebSocket.OPEN) return false
      host.send(frame)
    })
  }

  private hostConnection(): Connection<HostConnectionState> | undefined {
    for (const connection of this.getConnections<HostConnectionState>(HOST_CONNECTION_TAG)) {
      if (connection.readyState === WebSocket.OPEN) return connection
    }
    return undefined
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
    if (this.state.status !== 'ready' || this.state.turn.state !== 'running') {
      this.publishClearActivity()
      return
    }
    this.publishActivityRecord(this.state.turn.turnId)
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

  private publishActivityRecord(turnId: TurnId): void {
    void this.resources
      .hostRelay()
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
    void this.resources
      .hostRelay()
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

function hasSubprotocol(request: Request, expected: string): boolean {
  return (
    request.headers
      .get('sec-websocket-protocol')
      ?.split(',')
      .map((value) => value.trim())
      .includes(expected) === true
  )
}

function isHostConnection(request: Request): boolean {
  return hasSubprotocol(request, HOST_CONVERSATION_SUBPROTOCOL)
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch values have no declared runtime type.
function throwHostError(error: unknown): never {
  if (error instanceof HostConnectionUnavailableError) throw new HostOfflineError()
  if (error instanceof HostRequestTimeoutError) throw new RequestTimeoutError()
  if (error instanceof HostApplicationResponseError) {
    switch (error.payload._tag) {
      case 'ConversationNotFoundError':
        throw new ConversationNotFoundError()
      case 'ConversationBusyError':
        throw new ConversationBusyError()
      case 'PermissionNotFoundError':
        throw new PermissionNotFoundError()
      case 'ElicitationNotFoundError':
        throw new ElicitationNotFoundError()
      case 'ConfigurationNotFoundError':
        throw new ConfigurationNotFoundError()
      case 'RequestTimeoutError':
        throw new RequestTimeoutError()
    }
  }
  throw new InternalServerError()
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch values have no declared runtime type.
function hostErrorMessage(error: unknown): string {
  if (error instanceof HostOfflineError) return 'The Mac host is offline.'
  if (error instanceof ConversationBusyError) return 'A turn is already running.'
  return 'The conversation could not start.'
}
