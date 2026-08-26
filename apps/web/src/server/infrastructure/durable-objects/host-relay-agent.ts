import {
  ConversationIdSchema,
  ConversationNotFoundError,
  HOST_CONVERSATION_SUBPROTOCOL,
  HOST_CONTROL_SUBPROTOCOL,
  HostControlMethods,
  HostIdSchema,
  HostOfflineError,
  createLogger,
  jsonRpcNotification,
  type ConversationSummary,
  type ConversationId,
  type HostControlMethodMap,
  type HostId,
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
import { HostJsonRpcSocket } from './relay/host-json-rpc-socket.ts'
import { admitHostSocket, hasSubprotocol, openHostConnection } from './relay/host-subprotocol.ts'
import { rethrowAgentError } from './relay/rethrow-agent-error.ts'

const logger = createLogger('host-relay-agent')
const HOST_CONNECTION_TAG = 'host-control'
const HOST_CONVERSATION_TAG = 'host-conversation'
const CONVERSATIONS_CHANGED_NOTIFICATION = JSON.stringify(
  jsonRpcNotification('conversations.changed', {}),
)

/** Parent Agent for Host lifecycle and the conversation cache. */
export class HostRelayAgent extends Agent<RuntimeEnv, HostRelayState> {
  static options = { sendIdentityOnConnect: true }

  initialState: HostRelayState = { hostStatus: 'offline', activeConversations: [] }

  private readonly resources: HostRelayResources
  private readonly hostId: HostId
  private readonly hostSocket: HostJsonRpcSocket<typeof HostControlMethods>
  private syncing: Promise<void> | undefined

  /** Initialize schema and application dependencies before requests run. */
  constructor(ctx: AgentContext, env: RuntimeEnv) {
    super(ctx, env)
    const relayDb = createRelayDatabase(ctx.storage)
    void ctx.blockConcurrencyWhile(() => migrate(relayDb, migrations))
    this.resources = createHostRelayResources(relayDb, () => createDatabase(env.DB))
    this.hostId = HostIdSchema.parse(this.name)
    this.hostSocket = new HostJsonRpcSocket({
      methods: HostControlMethods,
      notificationHandlers: {
        'conversation.updated': (params) => this.handleConversationUpdated(params),
        'conversation.removed': (params) => this.handleConversationRemoved(params),
      },
    })
  }

  /** Restore status from hibernating sockets without replaying application requests. */
  override onStart(): void {
    const host = this.hostConnection()
    if (host !== undefined) this.hostSocket.attach(host)
    this.setHostStatus(host !== undefined ? 'online' : 'offline')
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
    return !this.isHostUpgrade(context.request)
  }

  override shouldSendProtocolMessages(
    _connection: Connection,
    context: ConnectionContext,
  ): boolean {
    return !this.isHostUpgrade(context.request)
  }

  /** Accept one authenticated Host control socket. */
  override async onConnect(connection: Connection, context: ConnectionContext): Promise<void> {
    if (
      !admitHostSocket({
        connection,
        request: context.request,
        subprotocol: HOST_CONTROL_SUBPROTOCOL,
        previous: this.getConnections(HOST_CONNECTION_TAG),
        expectedHostId: this.hostId,
      })
    ) {
      return
    }
    this.hostSocket.attach(connection)
    logger.info('host_websocket_connected', {
      hostId: this.hostId,
      connectionId: connection.id,
      subprotocol: HOST_CONTROL_SUBPROTOCOL,
    })
    this.setHostStatus('online')
    this.recordHostSeen(this.hostId)
    this.syncConversationsInBackground()
  }

  /** Handle Host control responses and notifications. */
  override async onMessage(connection: Connection, frame: WSMessage): Promise<void> {
    if (!connection.tags.includes(HOST_CONNECTION_TAG)) return
    const close = await this.hostSocket.handleMessage(connection, frame)
    if (close !== undefined) connection.close(close.code, close.reason)
  }

  /** Log each Host close, then publish offline after the final control socket closes. */
  override async onClose(
    connection: Connection,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    if (!connection.tags.includes(HOST_CONNECTION_TAG)) return
    const details = {
      hostId: this.hostId,
      connectionId: connection.id,
      code,
      reason,
      wasClean,
    }
    if (wasClean) logger.info('host_websocket_closed', details)
    else logger.warn('host_websocket_closed', details)

    if (this.hostConnection() !== undefined) return
    this.hostSocket.clear()
    this.setHostStatus('offline')
    this.recordHostSeen(this.hostId)
  }

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The Agents SDK declares WebSocket errors as unknown.
  override onError(connection: Connection, error: unknown): never
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The Agents SDK declares Agent errors as unknown.
  override onError(error: unknown): never
  /** Log the original SDK error, then preserve the SDK rethrow contract. */
  override onError(...args: [connection: Connection, error: unknown] | [error: unknown]): never {
    rethrowAgentError(logger, args, {
      agentEvent: 'host_relay_error',
      hostTag: HOST_CONNECTION_TAG,
      details: { hostId: this.hostId },
    })
  }

  /**
   * Refuse every child this relay does not know.
   *
   * A gate and nothing else. Waking the Mac for a conversation belongs to the
   * child, which is the only side that can see whether the Mac is already there.
   */
  override async onBeforeSubAgent(
    _request: Request,
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
  ): Promise<ConversationSummary> {
    const conversation = await this.hostSocket.request('conversation.create', params)
    this.resources.conversationRepository.save(conversation)
    this.publishConversationChange()
    return conversation
  }

  /** Ask the Host to open or reuse one conversation connection. */
  async attachConversation(conversationId: ConversationId): Promise<void> {
    if (this.resources.conversationRepository.find(conversationId) === undefined) {
      throw new ConversationNotFoundError()
    }
    await this.hostSocket.request('conversation.attach', { conversationId })
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
    this.hostSocket.clear()
    for (const connection of this.getConnections()) connection.close(1000, 'pairing ended')
    await Promise.all(
      this.listSubAgents(ConversationAgent).map((child) =>
        this.deleteSubAgent(ConversationAgent, child.name),
      ),
    )
    await this.destroy()
  }

  private async handleConversationUpdated(
    params: HostControlMethodMap['conversation.updated']['params'],
  ): Promise<void> {
    this.resources.conversationRepository.updateMetadata(params.conversationId, params.update)
    this.publishConversationChange()
  }

  private async handleConversationRemoved(
    params: HostControlMethodMap['conversation.removed']['params'],
  ): Promise<void> {
    this.resources.conversationRepository.delete(params.conversationId)
    this.clearConversationActivity(params.conversationId)
    if (this.hasSubAgent(ConversationAgent, params.conversationId)) {
      await this.deleteSubAgent(ConversationAgent, params.conversationId)
    }
    this.publishConversationChange()
  }

  private syncConversationsInBackground(): void {
    if (this.syncing !== undefined || this.hostConnection() === undefined) return
    this.syncing = this.syncConversations().finally(() => {
      this.syncing = undefined
    })
    void this.syncing.catch((error) => {
      if (error instanceof HostOfflineError) return
      logger.error('conversation_list_sync_failed', { error })
    })
  }

  private async syncConversations(): Promise<void> {
    const conversations: ConversationSummary[] = []
    let cursor: HostControlMethodMap['conversations.list']['params']['cursor']
    do {
      // oxlint-disable-next-line no-await-in-loop -- Each cursor comes from the prior result.
      const result = await this.hostSocket.request(
        'conversations.list',
        cursor === undefined ? {} : { cursor },
      )
      conversations.push(...result.conversations)
      cursor = result.next
    } while (cursor !== undefined)
    this.resources.conversationRepository.replaceAll(conversations)
    this.publishConversationChange()
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

  private hostConnection(): Connection | undefined {
    return openHostConnection(this.getConnections(HOST_CONNECTION_TAG))
  }

  private isHostUpgrade(request: Request): boolean {
    return (
      hasSubprotocol(request, HOST_CONTROL_SUBPROTOCOL) ||
      hasSubprotocol(request, HOST_CONVERSATION_SUBPROTOCOL)
    )
  }
}
