import {
  ConversationIdSchema,
  ConversationNotFoundError,
  HOST_CONVERSATION_SUBPROTOCOL,
  HOST_CONTROL_SUBPROTOCOL,
  HostControlMethods,
  HostIdSchema,
  HostOfflineError,
  InternalServerError,
  RequestTimeoutError,
  HostRequestIdSchema,
  JsonRpcReadError,
  JsonRpcTextSchema,
  createLogger,
  readJsonRpcIncoming,
  readJsonRpcTextFrame,
  sendJsonRpcFrame,
  type Conversation,
  type ConversationId,
  type HostControlMethodMap,
  type HostId,
  type JsonRpcInboundNotification,
  type HostRelayState,
  type HostStatus,
  type ListConversationsParams,
  type ListConversationsResult,
  type RelayActiveConversation,
} from '@porte/core'
import { recordHostSeen } from '@server/application/commands/record-host-seen.command.ts'
import { createDatabase } from '@server/infrastructure/persistence/database/connection.ts'
import { createRelayDatabase } from '@server/infrastructure/persistence/relay/connection.ts'
import migrations from '@server/infrastructure/persistence/relay/migrations/migrations.js'
import type { RuntimeEnv } from '@server/infrastructure/runtime-env.ts'
import {
  Agent,
  parseSubAgentPath,
  type AgentContext,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from 'agents'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'

// oxlint-disable-next-line import/no-cycle -- The Agents SDK resolves the runtime child class.
import { ConversationAgent } from './conversation-agent.ts'
import { createHostRelayResources, type HostRelayResources } from './host-relay-resources.ts'
import {
  HostApplicationResponseError,
  HostConnectionUnavailableError,
  HostJsonRpcRequests,
  HostRequestTimeoutError,
} from './relay/host-json-rpc-requests.ts'
import { RELAY_HOST_ID_HEADER } from './relay/relay-headers.ts'

const logger = createLogger('host-relay-agent')
const HOST_CONNECTION_TAG = 'host-control'
const HOST_CONVERSATION_TAG = 'host-conversation'
const LIST_LIMIT = 100
const CONVERSATIONS_CHANGED_NOTIFICATION = JSON.stringify({
  jsonrpc: '2.0',
  method: 'conversations.changed',
  params: {},
})

/** Parent Agent for Host lifecycle and the conversation cache. */
export class HostRelayAgent extends Agent<RuntimeEnv, HostRelayState> {
  static options = { hibernate: false }

  initialState: HostRelayState = { hostStatus: 'offline', activeConversations: [] }

  private readonly resources: HostRelayResources
  private readonly hostId: HostId
  private readonly requests: HostJsonRpcRequests
  private syncing: Promise<void> | undefined

  /** Initialize schema and application dependencies before requests run. */
  constructor(ctx: AgentContext, env: RuntimeEnv) {
    super(ctx, env)
    const relayDb = createRelayDatabase(ctx.storage)
    void ctx.blockConcurrencyWhile(() => migrate(relayDb, migrations))
    this.resources = createHostRelayResources(relayDb, () => createDatabase(env.DB))
    this.hostId = HostIdSchema.parse(this.name)
    this.requests = new HostJsonRpcRequests((frame) => this.sendHostFrame(frame))
  }

  /** Restore status from hibernating sockets without replaying application requests. */
  override onStart(): void {
    const online = this.hostConnection() !== undefined
    this.setHostStatus(online ? 'online' : 'offline')
  }

  /** Tag only the Host control socket on this parent object. */
  override getConnectionTags(_connection: Connection, context: ConnectionContext): string[] {
    const child = parseSubAgentPath(context.request.url, {
      knownClasses: [ConversationAgent.name],
    })
    if (child !== null) {
      return hasSubprotocol(context.request, HOST_CONVERSATION_SUBPROTOCOL)
        ? [HOST_CONVERSATION_TAG]
        : []
    }
    return hasSubprotocol(context.request, HOST_CONTROL_SUBPROTOCOL) ? [HOST_CONNECTION_TAG] : []
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

  /** Accept one authenticated Host control socket. */
  override async onConnect(connection: Connection, context: ConnectionContext): Promise<void> {
    if (!hasSubprotocol(context.request, HOST_CONTROL_SUBPROTOCOL)) return
    const hostId = HostIdSchema.safeParse(context.request.headers.get(RELAY_HOST_ID_HEADER))
    if (
      !hostId.success ||
      hostId.data !== this.hostId ||
      !hasSubprotocol(context.request, HOST_CONTROL_SUBPROTOCOL)
    ) {
      connection.close(1008, 'invalid host control connection')
      return
    }

    for (const previous of this.getConnections(HOST_CONNECTION_TAG)) {
      if (previous.id !== connection.id) previous.close(1008, 'host control replaced')
    }
    this.setHostStatus('online')
    this.recordHostSeen(hostId.data)
    this.syncConversationsInBackground()
  }

  /** Handle Host control responses and notifications. */
  override async onMessage(connection: Connection, frame: WSMessage): Promise<void> {
    const parsedFrame = readJsonRpcTextFrame(JsonRpcTextSchema.safeParse(frame))
    if (!parsedFrame.ok) {
      logger.warn('websocket_frame_rejected', {
        details: { code: parsedFrame.close.code, reason: parsedFrame.close.reason },
      })
      connection.close(parsedFrame.close.code, parsedFrame.close.reason)
      return
    }
    if (!connection.tags.includes(HOST_CONNECTION_TAG)) return
    try {
      const incoming = readJsonRpcIncoming(
        parsedFrame.frame,
        HostControlMethods,
        HostRequestIdSchema,
      )
      if (incoming.kind === 'response') {
        if (this.requests.accept(incoming.data)) return
        connection.close(1007, 'unexpected control document')
        return
      }
      if (incoming.kind === 'notification') {
        await this.applyNotification(incoming.data)
        return
      }
      connection.close(1007, 'unexpected control document')
    } catch (cause) {
      if (cause instanceof JsonRpcReadError) {
        connection.close(1007, 'invalid JSON-RPC document')
        return
      }
      throw cause
    }
  }

  /** Publish offline only after the final Host control socket closes. */
  override async onClose(connection: Connection): Promise<void> {
    if (!connection.tags.includes(HOST_CONNECTION_TAG) || this.hostConnection() !== undefined)
      return
    this.requests.close()
    this.setHostStatus('offline')
    this.recordHostSeen(this.hostId)
  }

  /** Allow child access from the cache and attach browser access to the Host. */
  override async onBeforeSubAgent(
    request: Request,
    child: { className: string; name: string },
  ): Promise<Response | void> {
    const conversationId = ConversationIdSchema.safeParse(child.name)
    if (
      child.className !== ConversationAgent.name ||
      !conversationId.success ||
      this.resources.conversationRepository.find(conversationId.data) === undefined
    ) {
      return new Response('Not found', { status: 404 })
    }
    if (hasSubprotocol(request, HOST_CONVERSATION_SUBPROTOCOL)) return
    try {
      await this.attachConversation(conversationId.data)
    } catch {
      return new Response('Host is offline', { status: 503 })
    }
  }

  /** Return one cached conversation page. */
  readConversations(query: ListConversationsParams): ListConversationsResult {
    return this.resources.conversationRepository.findList(query)
  }

  /** Return the current Host connection status. */
  readStatus(): HostStatus {
    return { status: this.state.hostStatus }
  }

  /** Create one conversation through the control connection. */
  async createConversation(
    params: HostControlMethodMap['conversation.create']['params'],
  ): Promise<Conversation> {
    this.requireHost()
    try {
      const conversation = await this.requests.request(
        'conversation.create',
        params,
        HostControlMethods['conversation.create'].result,
      )
      this.resources.conversationRepository.save(conversation)
      this.publishConversationChange()
      return conversation
    } catch (error) {
      return throwHostError(error)
    }
  }

  /** Ask the Host to open or reuse one conversation connection. */
  async attachConversation(conversationId: ConversationId): Promise<void> {
    if (this.resources.conversationRepository.find(conversationId) === undefined) {
      throw new ConversationNotFoundError()
    }
    this.requireHost()
    try {
      await this.requests.request(
        'conversation.attach',
        { conversationId },
        HostControlMethods['conversation.attach'].result,
      )
    } catch (error) {
      throwHostError(error)
    }
  }

  /** Receive the small activity projection from one child Agent. */
  setConversationActivity(activity: RelayActiveConversation): void {
    const activeConversations = [
      ...this.state.activeConversations.filter(
        (current) => current.conversationId !== activity.conversationId,
      ),
      activity,
    ]
    this.setState({ ...this.state, activeConversations })
  }

  /** Remove one conversation from the small activity projection. */
  clearConversationActivity(conversationId: ConversationId): void {
    const activeConversations = this.state.activeConversations.filter(
      (current) => current.conversationId !== conversationId,
    )
    if (activeConversations.length !== this.state.activeConversations.length) {
      this.setState({ ...this.state, activeConversations })
    }
  }

  /** Close connections and delete all parent and child state after unpairing. */
  async disconnectAll(): Promise<void> {
    this.requests.close()
    for (const connection of this.getConnections()) connection.close(1000, 'pairing ended')
    await Promise.all(
      this.listSubAgents(ConversationAgent).map((child) =>
        this.deleteSubAgent(ConversationAgent, child.name),
      ),
    )
    await this.destroy()
  }

  private async applyNotification(
    notification: JsonRpcInboundNotification<typeof HostControlMethods>,
  ): Promise<void> {
    if (notification.method === 'conversation.updated') {
      this.resources.conversationRepository.save(notification.params.conversation)
      this.publishConversationChange()
      return
    }
    const { conversationId } = notification.params
    this.resources.conversationRepository.delete(conversationId)
    this.clearConversationActivity(conversationId)
    if (this.hasSubAgent(ConversationAgent, conversationId)) {
      await this.deleteSubAgent(ConversationAgent, conversationId)
    }
    this.publishConversationChange()
  }

  private syncConversationsInBackground(): void {
    if (this.syncing !== undefined || this.hostConnection() === undefined) return
    this.syncing = this.syncConversations().finally(() => {
      this.syncing = undefined
    })
    void this.syncing.catch((error) => {
      logger.error('conversation_list_sync_failed', { error })
    })
  }

  private async syncConversations(): Promise<void> {
    const conversations: Conversation[] = []
    let cursor: HostControlMethodMap['conversations.list']['params']['cursor']
    do {
      // oxlint-disable-next-line no-await-in-loop -- Each cursor comes from the prior result.
      const result = await this.requests.request(
        'conversations.list',
        cursor === undefined ? { limit: LIST_LIMIT } : { cursor, limit: LIST_LIMIT },
        HostControlMethods['conversations.list'].result,
      )
      conversations.push(...result.conversations)
      cursor = result.next
    } while (cursor !== undefined)
    this.resources.conversationRepository.replaceAll(conversations)
    this.publishConversationChange()
  }

  private requireHost(): Connection {
    const host = this.hostConnection()
    if (host === undefined) throw new HostOfflineError()
    return host
  }

  private async sendHostFrame(frame: string): Promise<void> {
    const host = this.requireHost()
    await sendJsonRpcFrame(() => {
      if (host.readyState !== WebSocket.OPEN) return false
      host.send(frame)
    })
  }

  private hostConnection(): Connection | undefined {
    for (const connection of this.getConnections(HOST_CONNECTION_TAG)) {
      if (connection.readyState === WebSocket.OPEN) return connection
    }
    return undefined
  }

  private setHostStatus(hostStatus: HostRelayState['hostStatus']): void {
    if (this.state.hostStatus !== hostStatus) this.setState({ ...this.state, hostStatus })
  }

  private publishConversationChange(): void {
    const host = this.hostConnection()
    this.broadcast(CONVERSATIONS_CHANGED_NOTIFICATION, host === undefined ? [] : [host.id])
  }

  private async rememberSeen(hostId: HostId): Promise<void> {
    await recordHostSeen(this.resources.hostRepository, hostId, new Date())
  }

  private recordHostSeen(hostId: HostId): void {
    void this.rememberSeen(hostId).catch((error) => {
      logger.error('host_seen_failed', { error, details: { hostId } })
    })
  }
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
  return (
    hasSubprotocol(request, HOST_CONTROL_SUBPROTOCOL) ||
    hasSubprotocol(request, HOST_CONVERSATION_SUBPROTOCOL)
  )
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch values have no declared runtime type.
function throwHostError(error: unknown): never {
  if (error instanceof HostConnectionUnavailableError) throw new HostOfflineError()
  if (error instanceof HostRequestTimeoutError) throw new RequestTimeoutError()
  if (error instanceof HostApplicationResponseError) {
    if (error.payload._tag === 'ConversationNotFoundError') {
      throw new ConversationNotFoundError()
    }
  }
  throw new InternalServerError()
}
