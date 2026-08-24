import {
  ConversationIdSchema,
  ConversationBusyError,
  ConversationNotFoundError,
  HostCommandResponseSchema,
  HostCommandSchemas,
  HostIdSchema,
  HostOfflineError,
  InternalServerError,
  HostToRelayMessageSchema,
  HOST_OPERATION_DELIVERY_DEADLINE_MS,
  HOST_OPERATION_RETENTION_MS,
  RELAY_HEARTBEAT_INTERVAL_MS,
  RELAY_HEARTBEAT_REQUEST,
  RELAY_HEARTBEAT_RESPONSE,
  RELAY_HEARTBEAT_TIMEOUT_MS,
  OperationConflictError,
  OperationExpiredError,
  NotAuthorizedError,
  RequestTimeoutError,
  ValidationError,
  createHostCommand,
  createLogger,
  createOperationId,
  reduceHostRelayActivity,
  type ConversationId,
  type ConversationTranscript,
  type ConversationPage,
  type ConversationPageQuery,
  type EventSequence,
  type HostCommand,
  type HostCommandInput,
  type HostCommandMap,
  type HostCommandMethod,
  type HostCommandResponse,
  type HostConversationStreamMessage,
  type HostConversationListMessage,
  type HostEventAck,
  type HostId,
  type HostStatus,
  type HostRelayState,
  type OperationId,
  type PorteErrorPayload,
  type RelayToHostMessage,
} from '@porte/core'
import { recordHostSeen } from '@server/application/commands/record-host-seen.command.ts'
import { toErrorPayload } from '@server/infrastructure/errors/to-error-payload.ts'
import { createDatabase } from '@server/infrastructure/persistence/database/connection.ts'
import { createRelayDatabase } from '@server/infrastructure/persistence/relay/connection.ts'
import migrations from '@server/infrastructure/persistence/relay/migrations/migrations.js'
import type { RuntimeEnv } from '@server/infrastructure/runtime-env.ts'
import {
  Agent,
  callable,
  parseSubAgentPath,
  type AgentContext,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from 'agents'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import { z } from 'zod'

// oxlint-disable-next-line import/no-cycle -- The Agents SDK resolves the runtime child class.
import { ConversationAgent } from './conversation-agent.ts'
import {
  createHostRelayResources,
  type HostRelayResources,
} from './host-relay-resources.ts'
import { RELAY_HOST_ID_HEADER, RELAY_ROLE_HEADER } from './relay/relay-headers.ts'

const logger = createLogger('host-relay-agent')
const HOST_CONNECTION_TAG = 'host'
const OPERATION_PREFIX = 'host-operation:'
const CONVERSATION_ACCESS_PREFIX = 'conversation-access:'
const CATALOG_SYNC_KEY = 'catalog-sync'
const CATALOG_STALE_AFTER_MS = 30_000
const CATALOG_EXPIRY_MS = 7 * 24 * 60 * 60 * 1_000
const CATALOG_EXPIRY_CALLBACK = 'expireCatalog'
const COMMAND_TIMEOUT_MS = 30_000
const MAX_CONVERSATION_ROWS = 10_000
const UNSYNCED = 'unsynced'
const HOST_LIVENESS_CALLBACK = 'checkHostLiveness'

type HostConnectionState = {
  readonly role: 'host'
  readonly hostId: HostId
  readonly connectedAt: number
}
type OperationRecord =
  | { readonly status: 'pending'; readonly command: HostCommand; readonly createdAt: number }
  | {
      readonly status: 'completed'
      readonly command: HostCommand
      readonly response: HostCommandResponse
      readonly createdAt: number
      readonly completedAt: number
    }
  | {
      readonly status: 'expired'
      readonly command: HostCommand
      readonly response: HostCommandResponse
      readonly createdAt: number
      readonly expiredAt: number
    }
type CatalogSyncState =
  | { readonly status: 'requested'; readonly operationId: OperationId; readonly at: number }
  | { readonly status: 'synced'; readonly operationId: OperationId; readonly at: number }

type OperationWaiter = (response: HostCommandResponse) => void
type HostCommandCall<Method extends HostCommandMethod> = {
  readonly operationId: OperationId
  readonly params: HostCommandMap[Method]['params']
}

class HostConnectionSendError extends Error {
  constructor(
    readonly connectionId: string,
    cause: unknown,
  ) {
    super('Host connection send failed', { cause })
    this.name = 'HostConnectionSendError'
  }
}

/**
 * The parent Agent for one Mac host.
 * It owns the host socket, command ledger, state, and conversation registry.
 */
export class HostRelayAgent extends Agent<RuntimeEnv, HostRelayState> {
  initialState: HostRelayState = {
    hostStatus: 'offline',
    catalogRevision: 0,
    activeConversations: [],
  }

  private readonly resources: HostRelayResources
  private readonly hostId: HostId
  private readonly operationWaiters = new Map<OperationId, Set<OperationWaiter>>()

  /** Wires the Agent to its Durable Object storage and application dependencies. */
  constructor(ctx: AgentContext, env: RuntimeEnv) {
    super(ctx, env)

    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(RELAY_HEARTBEAT_REQUEST, RELAY_HEARTBEAT_RESPONSE),
    )

    const db = createRelayDatabase(ctx.storage)
    void ctx.blockConcurrencyWhile(() => migrate(db, migrations))
    const applicationDb = createDatabase(env.DB)
    this.resources = createHostRelayResources(db, () => applicationDb, {
      getByName: (name) => this.subAgent(ConversationAgent, name),
    })

    // SAFETY: the name comes from a HostId the host repository already parsed.
    this.hostId = this.name as HostId
  }

  /**
   * Recomputes host status and replays pending commands after an Agent wake.
   *
   * Nothing here leaves this object. The runtime runs `onStart` inside
   * `blockConcurrencyWhile`, so a call to a child could queue behind the gate
   * this object still holds, and the 30s timeout would reset it.
   * @internal
   */
  override async onStart(): Promise<void> {
    const host = this.hostConnection()
    this.setHostStatus(host === undefined ? 'offline' : 'online')
    if (host === undefined) return
    await this.scheduleEvery(RELAY_HEARTBEAT_INTERVAL_MS / 1_000, HOST_LIVENESS_CALLBACK)

    try {
      await this.resendPendingCommands(host)
    } catch (error) {
      if (!(error instanceof HostConnectionSendError)) throw error
      this.handleHostSendFailure(host, error)
    }
  }

  /**
   * Tags host and child sockets for hibernation-safe lookup and cleanup.
   * @internal
   */
  override getConnectionTags(_connection: Connection, context: ConnectionContext): string[] {
    if (context.request.headers.get(RELAY_ROLE_HEADER) === 'daemon') return [HOST_CONNECTION_TAG]

    const child = parseSubAgentPath(context.request.url, {
      knownClasses: [ConversationAgent.name],
    })
    const conversationId = ConversationIdSchema.safeParse(child?.childName)
    return child?.childClass === ConversationAgent.name && conversationId.success
      ? [conversationConnectionTag(conversationId.data)]
      : []
  }

  /**
   * Prevents browser state writes while the Mac hook can publish state.
   * @internal
   */
  override shouldConnectionBeReadonly(
    _connection: Connection,
    context: ConnectionContext,
  ): boolean {
    return context.request.headers.get(RELAY_ROLE_HEADER) !== 'daemon'
  }

  /** Rejects direct state frames while server hooks can publish state. */
  override validateStateChange(_nextState: HostRelayState, source: Connection | 'server'): void {
    if (source !== 'server') throw new NotAuthorizedError()
  }

  /**
   * Sends standard Agent frames to browsers but not to the Mac.
   * @internal
   */
  override shouldSendProtocolMessages(
    _connection: Connection,
    context: ConnectionContext,
  ): boolean {
    return context.request.headers.get(RELAY_ROLE_HEADER) !== 'daemon'
  }

  /**
   * Registers one authenticated Mac socket and starts recovery after acceptance.
   * @internal
   */
  override async onConnect(connection: Connection, context: ConnectionContext): Promise<void> {
    if (context.request.headers.get(RELAY_ROLE_HEADER) !== 'daemon') return

    const hostId = HostIdSchema.safeParse(context.request.headers.get(RELAY_HOST_ID_HEADER))
    if (!hostId.success || hostId.data !== this.hostId) {
      connection.close(1008, 'invalid host identity')
      return
    }

    connection.setState({
      role: 'host',
      hostId: hostId.data,
      connectedAt: Date.now(),
    } satisfies HostConnectionState)
    for (const previous of this.getConnections(HOST_CONNECTION_TAG)) {
      if (previous.id !== connection.id) previous.close(1008, 'host connection replaced')
    }

    this.setHostStatus('online')
    this.recordHostSeen(hostId.data)
    await this.scheduleEvery(RELAY_HEARTBEAT_INTERVAL_MS / 1_000, HOST_LIVENESS_CALLBACK)
    this.resumeHostConnectionInBackground(connection)
  }

  /**
   * Dispatches validated Mac frames after the SDK consumes its own frames.
   * @internal
   */
  override async onMessage(connection: Connection, frame: WSMessage): Promise<void> {
    if (!this.isHostConnection(connection)) return
    const text = z.string().safeParse(frame)
    if (!text.success) {
      connection.close(1003, 'host message must be text')
      return
    }
    const message = parseHostMessage(text.data)
    if (!message.success) {
      logger.error('host_message_invalid', { details: { issues: message.error.message } })
      connection.close(1007, 'invalid host message')
      return
    }

    if (message.data.type === 'command.result' || message.data.type === 'command.error') {
      await this.completeOperation(connection, message.data)
      return
    }

    if (
      message.data.type === 'conversation.event' ||
      message.data.type === 'conversation.snapshot'
    ) {
      await this.forwardConversationRecord(connection, message.data)
      return
    }

    await this.applyListChange(message.data)
  }

  /**
   * Publishes offline state only when the final Mac socket closes.
   * @internal
   */
  override async onClose(connection: Connection): Promise<void> {
    if (!this.isHostConnection(connection) || this.hostConnection() !== undefined) return

    this.setHostStatus('offline')
    this.resolveAllWaitersWithHostOffline()
    this.recordHostSeen(this.hostId)
    await this.cancelHostLivenessSchedules()
  }

  /** Expires a Mac socket that stopped carrying heartbeat traffic. */
  async checkHostLiveness(): Promise<void> {
    const host = this.hostConnection()
    if (host === undefined) {
      await this.cancelHostLivenessSchedules()
      return
    }

    const state = host.state
    if (state === null) {
      host.close(1008, 'invalid host connection state')
      return
    }

    const lastHeartbeatAt = this.ctx.getWebSocketAutoResponseTimestamp(host)?.getTime()
    if (
      Date.now() - (lastHeartbeatAt ?? state.connectedAt) <=
      RELAY_HEARTBEAT_INTERVAL_MS + RELAY_HEARTBEAT_TIMEOUT_MS
    ) {
      return
    }

    host.close(1011, 'host heartbeat expired')
  }

  /**
   * Allows browser access only after a successful transcript read.
   * @internal
   */
  override async onBeforeSubAgent(
    _request: Request,
    child: { className: string; name: string },
  ): Promise<Response | void> {
    const conversationId = ConversationIdSchema.safeParse(child.name)
    if (
      child.className !== ConversationAgent.name ||
      !conversationId.success ||
      !(await this.isConversationAuthorized(conversationId.data))
    ) {
      return new Response('Not found', { status: 404 })
    }
  }

  /**
   * Web flow: returns one cached page and requests a background refresh.
   * @public
   */
  readConversations(query: ConversationPageQuery): ConversationPage {
    const page = this.resources.conversationRepository.findPage(query)
    this.requestCatalogSyncInBackground()
    return page
  }

  /**
   * Web flow: returns host status before the browser receives Agent state.
   * @public
   */
  readStatus(): HostStatus {
    return { status: this.state.hostStatus }
  }

  /**
   * Web flow: reads one transcript page.
   *
   * The frame stops here. Expected host failures become typed throws.
   */
  async readConversation(
    params: HostCommandMap['conversation.read']['params'],
  ): Promise<ConversationTranscript> {
    const response = await this.executeHostCommand<'conversation.read'>({
      operationId: createOperationId(),
      method: 'conversation.read',
      params,
    })
    if (response.type === 'command.error') throwConversationReadError(response.error)

    await this.authorizeConversation(params.conversationId)
    await this.resources.conversationAgents.initializeConversation(
      params.conversationId,
      response.result.state,
    )
    await this.armCatalogExpiry()
    return response.result
  }

  /** Chat flow: starts one idempotent turn on the Mac. */
  async startTurn(
    call: HostCommandCall<'turn.start'>,
  ): Promise<HostCommandMap['turn.start']['result']> {
    const response = await this.executeHostCommand<'turn.start'>(
      {
        operationId: call.operationId,
        method: 'turn.start',
        params: call.params,
      },
      true,
    )
    if (response.type === 'command.error') throwTurnStartError(response.error)
    return response.result
  }

  /**
   * Chat flow: stores one cancel before the child removes its active turn.
   *
   * A child calls this before it removes the active turn.
   */
  async cancelTurn(
    call: HostCommandCall<'turn.cancel'>,
  ): Promise<void> {
    const command = createHostCommand({
      operationId: call.operationId,
      method: 'turn.cancel',
      params: call.params,
    })
    const existing = await this.readOperation(command.operationId)
    if (existing !== undefined && !sameCommand(existing.command, command)) {
      throw new OperationConflictError()
    }
    if (existing?.status === 'expired') {
      throw new OperationExpiredError()
    }
    if (existing?.status === 'completed') return

    if (existing === undefined) await this.storePendingOperation(command)

    const host = this.hostConnection()
    if (host === undefined) return
    try {
      this.sendHostMessage(host, command)
    } catch (error) {
      if (!(error instanceof HostConnectionSendError)) throw error
      this.handleHostSendFailure(host, error)
    }
  }

  /** Web flow: validates and sends one permission answer through the parent Agent. */
  @callable()
  async answerPermission(
    input: HostCommandMap['permission.answer']['params'],
  ): Promise<HostCommandResponse<'permission.answer'>> {
    const operationId = createOperationId()
    const params = HostCommandSchemas['permission.answer'].params.safeParse(input)
    if (!params.success) {
      return {
        v: 2,
        type: 'command.error',
        operationId,
        error: toErrorPayload(ValidationError.fromZod(params.error)),
      }
    }
    if (!(await this.isConversationAuthorized(params.data.conversationId))) {
      return {
        v: 2,
        type: 'command.error',
        operationId,
        error: toErrorPayload(new NotAuthorizedError()),
      }
    }
    return await this.executeHostCommand({
      operationId,
      method: 'permission.answer',
      params: params.data,
    })
  }

  /** Stores and sends one command with its idempotency operation identifier. */
  private async executeHostCommand<Method extends HostCommandMethod>(
    input: HostCommandInput<Method>,
    queueWhenOffline?: boolean,
  ): Promise<HostCommandResponse<Method>>
  private async executeHostCommand(
    input: HostCommandInput,
    queueWhenOffline = false,
  ): Promise<HostCommandResponse> {
    const command = createHostCommand(input)
    const existing = await this.readOperation(command.operationId)
    if (existing !== undefined && !sameCommand(existing.command, command)) {
      return operationConflict(command.operationId)
    }
    if (existing?.status === 'completed' || existing?.status === 'expired') {
      return existing.response
    }

    if (existing === undefined) {
      if (this.hostConnection() === undefined && !queueWhenOffline) {
        return hostOffline(command.operationId)
      }
      await this.storePendingOperation(command)
    }

    const host = this.hostConnection()
    if (host === undefined) return hostOffline(command.operationId)
    return await this.sendAndWait(host, command)
  }

  /** Stores one new command and arms its bounded delivery deadline. */
  private async storePendingOperation(command: HostCommand): Promise<void> {
    const createdAt = Date.now()
    await this.ctx.storage.put(operationKey(command.operationId), {
      status: 'pending',
      command,
      createdAt,
    } satisfies OperationRecord)
    await this.ensureOperationCleanupSchedule(createdAt + HOST_OPERATION_DELIVERY_DEADLINE_MS)
  }

  /**
   * Unpair flow: closes every connection and destroys all parent Agent storage.
   * @public
   */
  async disconnectAll(): Promise<void> {
    this.setHostStatus('offline')
    this.resolveAllWaitersWithHostOffline()
    for (const connection of this.getConnections()) connection.close(1000, 'pairing ended')
    await Promise.all(
      this.listSubAgents(ConversationAgent).map((child) =>
        this.deleteConversationAgent(ConversationIdSchema.parse(child.name), 'pairing ended'),
      ),
    )
    await this.destroy()
  }

  /** Connects one durable command to its current in-memory RPC caller. */
  private async sendAndWait(host: Connection, command: HostCommand): Promise<HostCommandResponse> {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        removeWaiter(this.operationWaiters, command.operationId, waiter)
        resolve(commandTimeout(command.operationId))
      }, COMMAND_TIMEOUT_MS)

      const waiter: OperationWaiter = (response) => {
        clearTimeout(timeout)
        removeWaiter(this.operationWaiters, command.operationId, waiter)
        resolve(response)
      }
      addWaiter(this.operationWaiters, command.operationId, waiter)

      try {
        this.sendHostMessage(host, command)
      } catch (error) {
        if (!(error instanceof HostConnectionSendError)) {
          clearTimeout(timeout)
          removeWaiter(this.operationWaiters, command.operationId, waiter)
          reject(error)
          return
        }

        this.handleHostSendFailure(host, error)
        waiter(hostOffline(command.operationId))
      }
    })
  }

  /** Validates and stores one Mac result before it resolves active callers. */
  private async completeOperation(
    connection: Connection,
    response: z.infer<typeof HostCommandResponseSchema>,
  ): Promise<void> {
    const record = await this.readOperation(response.operationId)
    if (record === undefined) {
      logger.warn('host_operation_unknown', { details: { operationId: response.operationId } })
      return
    }
    if (record.status === 'completed' || record.status === 'expired') {
      this.resolveWaiters(response.operationId, record.response)
      return
    }

    let completedResponse: HostCommandResponse
    if (response.type === 'command.result') {
      const result = HostCommandSchemas[record.command.method].result.safeParse(response.result)
      if (!result.success) {
        logger.error('host_command_result_invalid', {
          details: {
            operationId: response.operationId,
            method: record.command.method,
            issues: result.error.message,
          },
        })
        connection.close(1007, 'invalid command result')
        return
      }
      completedResponse = { ...response, result: result.data }
    } else {
      completedResponse = response
    }

    const completedAt = Date.now()
    await this.ctx.storage.put(operationKey(completedResponse.operationId), {
      status: 'completed',
      command: record.command,
      response: completedResponse,
      createdAt: record.createdAt,
      completedAt,
    } satisfies OperationRecord)
    this.resolveWaiters(completedResponse.operationId, completedResponse)
    await this.ensureOperationCleanupSchedule(completedAt + HOST_OPERATION_RETENTION_MS)
  }

  /** Routes one ordered record and acknowledges only durable acceptance. */
  private async forwardConversationRecord(
    connection: Connection,
    message: HostConversationStreamMessage,
  ): Promise<void> {
    const sequence =
      message.type === 'conversation.event' ? message.eventSequence : message.throughEventSequence
    this.publishConversationActivity(
      message.type === 'conversation.event'
        ? {
            type: 'event',
            conversationId: message.conversationId,
            event: message.event,
          }
        : {
            type: 'snapshot',
            conversationId: message.conversationId,
            snapshot: message.snapshot,
          },
    )
    if (!this.hasSubAgent(ConversationAgent, message.conversationId)) {
      this.sendHostEventAck(connection, message.conversationId, sequence)
      return
    }
    try {
      const throughEventSequence =
        message.type === 'conversation.event'
          ? await this.resources.conversationAgents.acceptHostEvent(
              message.conversationId,
              message.eventSequence,
              message.event,
            )
          : await this.resources.conversationAgents.acceptHostSnapshot(
              message.conversationId,
              message.throughEventSequence,
              message.snapshot,
            )
      this.sendHostEventAck(connection, message.conversationId, throughEventSequence)
    } catch (error) {
      logger.error('conversation_stream_forward_failed', {
        error,
        details: {
          conversationId: message.conversationId,
          eventSequence: sequence,
        },
      })
      connection.close(1011, 'conversation event delivery failed')
      return
    }
  }

  /** Applies Mac catalog changes and publishes one query invalidation token. */
  private async applyListChange(message: HostConversationListMessage): Promise<void> {
    if (message.type === 'conversations.sync') {
      const sync = await this.readCatalogSyncState()
      if (sync?.operationId !== message.operationId) return

      this.resources.conversationRepository.saveAll(message.conversations, message.operationId)
      if (!message.done) return

      this.resources.conversationRepository.deleteOtherThan(message.operationId)
      this.resources.conversationRepository.deleteBeyond(MAX_CONVERSATION_ROWS)
      this.publishConversationActivity({ type: 'sync', activeTurns: message.activeTurns })
      await this.reconcileConversationTurns(message.activeTurns)
      await this.markCatalogSyncCompleted(message.operationId, Date.now())
      await this.armCatalogExpiry()
      this.bumpCatalogRevision()
      return
    }

    if (message.type === 'conversation.summary') {
      this.resources.conversationRepository.save(
        message.conversation,
        this.resources.conversationRepository.currentSyncRunId() ?? UNSYNCED,
      )
      await this.armCatalogExpiry()
      this.bumpCatalogRevision()
      return
    }

    this.resources.conversationRepository.delete(message.conversationId)
    this.publishConversationActivity({
      type: 'removed',
      conversationId: message.conversationId,
    })
    await this.revokeConversation(message.conversationId)
    this.bumpCatalogRevision()
  }

  /** Clears child turns that are not backed by this host process. */
  private async reconcileConversationTurns(
    activeTurns: Extract<
      HostConversationListMessage,
      { type: 'conversations.sync'; done: true }
    >['activeTurns'],
  ): Promise<void> {
    const active = new Map(activeTurns.map((turn) => [turn.conversationId, turn.turnId]))
    await Promise.all(
      this.listSubAgents(ConversationAgent).map(async (reference) => {
        await this.resources.conversationAgents.reconcileHostTurn(
          reference.name,
          active.get(ConversationIdSchema.parse(reference.name)) ?? null,
        )
      }),
    )
  }

  /** Records that the host returned this conversation to the current account. */
  private async authorizeConversation(conversationId: ConversationId): Promise<void> {
    await this.ctx.storage.put(conversationAccessKey(conversationId), true)
  }

  /** Returns whether the HTTP transcript flow authorized this child facet. */
  private async isConversationAuthorized(conversationId: ConversationId): Promise<boolean> {
    return (await this.ctx.storage.get<boolean>(conversationAccessKey(conversationId))) === true
  }

  /** Removes child access when the host removes the conversation. */
  private async revokeConversation(conversationId: ConversationId): Promise<void> {
    await this.ctx.storage.delete(conversationAccessKey(conversationId))
    await this.deleteConversationAgent(conversationId)
  }

  /** Closes routed sockets before the SDK deletes one child and its storage. */
  private async deleteConversationAgent(
    conversationId: ConversationId,
    reason = 'conversation removed',
  ): Promise<void> {
    if (!this.hasSubAgent(ConversationAgent, conversationId)) return

    for (const socket of this.ctx.getWebSockets(conversationConnectionTag(conversationId))) {
      socket.close(1000, reason)
    }
    await this.deleteSubAgent(ConversationAgent, conversationId)
  }

  /**
   * Starts one catalog sync when the stored catalog is stale.
   *
   * Answers with the sequence the Mac last numbered for each conversation, or
   * `undefined` when no sync ran, so the caller can tell "nothing to do" from
   * "the Mac knows nothing".
   */
  private async requestCatalogSync(
    force = false,
  ): Promise<Record<string, EventSequence> | undefined> {
    if (this.hostConnection() === undefined) return undefined

    const now = Date.now()
    const current = await this.readCatalogSyncState()
    if (!force && current !== undefined && now - current.at < CATALOG_STALE_AFTER_MS) {
      return undefined
    }

    const operationId = createOperationId()
    await this.markCatalogSyncRequested(operationId, now)
    const response = await this.executeHostCommand<'conversations.sync'>(
      {
        operationId,
        method: 'conversations.sync',
      },
      true,
    )
    return response.type === 'command.result' ? response.result.eventHeads : undefined
  }

  /** Reads the current catalog synchronization marker from Agent storage. */
  private async readCatalogSyncState(): Promise<CatalogSyncState | undefined> {
    return await this.ctx.storage.get<CatalogSyncState>(CATALOG_SYNC_KEY)
  }

  /** Records the catalog synchronization operation before command delivery. */
  private async markCatalogSyncRequested(operationId: OperationId, at: number): Promise<void> {
    await this.ctx.storage.put(CATALOG_SYNC_KEY, {
      status: 'requested',
      operationId,
      at,
    } satisfies CatalogSyncState)
  }

  /** Records the completed catalog synchronization accepted from the Mac. */
  private async markCatalogSyncCompleted(operationId: OperationId, at: number): Promise<void> {
    await this.ctx.storage.put(CATALOG_SYNC_KEY, {
      status: 'synced',
      operationId,
      at,
    } satisfies CatalogSyncState)
  }

  /** Deletes abandoned catalog and child state after the host stays offline. */
  async expireCatalog(): Promise<void> {
    if (this.hostConnection() !== undefined) {
      await this.armCatalogExpiry()
      return
    }

    this.resources.conversationRepository.deleteAll()
    const access = await this.ctx.storage.list<boolean>({ prefix: CONVERSATION_ACCESS_PREFIX })
    if (access.size > 0) await this.ctx.storage.delete([...access.keys()])
    await this.ctx.storage.delete(CATALOG_SYNC_KEY)
    await Promise.all(
      this.listSubAgents(ConversationAgent).map((child) =>
        this.deleteConversationAgent(ConversationIdSchema.parse(child.name)),
      ),
    )
    this.bumpCatalogRevision()
  }

  /** Replaces the catalog expiry with one check seven days after the latest write. */
  private async armCatalogExpiry(): Promise<void> {
    const schedules = await this.listSchedules()
    await Promise.all(
      schedules
        .filter((schedule) => schedule.callback === CATALOG_EXPIRY_CALLBACK)
        .map((schedule) => this.cancelSchedule(schedule.id)),
    )
    await this.schedule(
      new Date(Date.now() + CATALOG_EXPIRY_MS),
      CATALOG_EXPIRY_CALLBACK,
      undefined,
      {
        idempotent: true,
      },
    )
  }

  /** Owns logging for catalog sync work that must not delay a cached read. */
  private requestCatalogSyncInBackground(): void {
    void this.requestCatalogSync().catch((error) => {
      logger.error('catalog_sync_failed', { error })
    })
  }

  /** Starts host recovery without delaying the WebSocket upgrade response. */
  private resumeHostConnectionInBackground(connection: Connection): void {
    void this.resumeHostConnection(connection).catch((error) => {
      if (error instanceof HostConnectionSendError) {
        this.handleHostSendFailure(connection, error)
        return
      }
      logger.error('host_connection_resume_failed', { error })
    })
  }

  /**
   * Resends durable commands and refreshes the catalog after host connection.
   *
   * The sync runs first because its answer decides which conversations still
   * need a position: a Mac that kept its ledger needs none.
   */
  private async resumeHostConnection(connection: Connection): Promise<void> {
    const hostEventHeads = await this.requestCatalogSync(true)
    await this.sendConversationEventHeads(connection, hostEventHeads ?? {})
    await this.resendPendingCommands(connection)
  }

  /**
   * Restores a new host ledger from each child's existing sequence position.
   *
   * Only for conversations the Mac cannot number itself: a host that kept its
   * ledger already knows where to resume, and reading a child costs a wake.
   * Waking a child never belongs inside `onStart`, which the runtime gates
   * with `blockConcurrencyWhile`.
   */
  private async sendConversationEventHeads(
    host: Connection,
    hostEventHeads: Record<string, EventSequence>,
  ): Promise<void> {
    const unknown = this.listSubAgents(ConversationAgent).filter(
      (reference) => hostEventHeads[reference.name] === undefined,
    )
    // One unreadable child costs one position, not every position.
    const heads = await Promise.allSettled(
      unknown.map(async (reference) => ({
        // SAFETY: the facet was named from a ConversationId this object parsed.
        conversationId: reference.name as ConversationId,
        eventSequence: await this.resources.conversationAgents.acceptedEventHead(reference.name),
      })),
    )
    for (const head of heads) {
      if (head.status === 'rejected') {
        logger.error('conversation_event_head_failed', { error: head.reason })
        continue
      }
      if (head.value.eventSequence === undefined) continue
      this.sendHostEventAck(host, head.value.conversationId, head.value.eventSequence)
    }
  }

  /** Replays only commands whose Mac result is not durable yet. */
  private async resendPendingCommands(host: Connection): Promise<void> {
    const stored = await this.ctx.storage.list<OperationRecord>({ prefix: OPERATION_PREFIX })
    for (const value of stored.values()) {
      if (value.status === 'pending') {
        this.sendHostMessage(host, value.command)
      }
    }
  }

  /** Sends one typed message and converts only WebSocket send failures. */
  private sendHostMessage(connection: Connection, message: RelayToHostMessage): void {
    const frame = JSON.stringify(message)

    this.sendHostFrame(connection, frame)
  }

  /** Acknowledges one durable conversation stream position. */
  private sendHostEventAck(
    connection: Connection,
    conversationId: ConversationId,
    throughEventSequence: HostEventAck['throughEventSequence'],
  ): void {
    this.sendHostMessage(connection, {
      v: 2,
      type: 'event.ack',
      conversationId,
      throughEventSequence,
    })
  }

  /** Sends one prepared frame through the shared host transport error channel. */
  private sendHostFrame(connection: Connection, frame: string): void {
    try {
      connection.send(frame)
    } catch (cause) {
      throw new HostConnectionSendError(connection.id, cause)
    }
  }

  /** Logs once and closes the exact Mac connection that failed to send. */
  private handleHostSendFailure(connection: Connection, error: HostConnectionSendError): void {
    logger.warn('host_connection_send_failed', {
      error,
      details: { connectionId: error.connectionId },
    })
    connection.close(1011, 'host send failed')
  }

  /**
   * Expires pending operations, deletes retained tombstones, and schedules the next transition.
   * @internal
   */
  async cleanupOperations(): Promise<void> {
    const now = Date.now()
    const deliveryCutoff = now - HOST_OPERATION_DELIVERY_DEADLINE_MS
    const retentionCutoff = now - HOST_OPERATION_RETENTION_MS
    const stored = await this.ctx.storage.list<OperationRecord>({ prefix: OPERATION_PREFIX })
    const toDelete: string[] = []
    const toExpire: Array<{
      readonly key: string
      readonly record: Extract<OperationRecord, { status: 'pending' }>
      readonly response: HostCommandResponse
    }> = []
    let nextCleanupAt: number | undefined

    for (const [key, record] of stored) {
      if (record.status === 'pending' && record.createdAt < deliveryCutoff) {
        const response = operationExpired(record.command.operationId)
        toExpire.push({ key, record, response })
        nextCleanupAt = earlier(nextCleanupAt, now + HOST_OPERATION_RETENTION_MS)
        continue
      }

      const terminalAt =
        record.status === 'completed'
          ? record.completedAt
          : record.status === 'expired'
            ? record.expiredAt
            : undefined
      if (terminalAt !== undefined && terminalAt < retentionCutoff) {
        toDelete.push(key)
        continue
      }

      const recordCleanupAt =
        record.status === 'pending'
          ? record.createdAt + HOST_OPERATION_DELIVERY_DEADLINE_MS
          : terminalAt === undefined
            ? undefined
            : terminalAt + HOST_OPERATION_RETENTION_MS
      if (recordCleanupAt !== undefined) {
        nextCleanupAt = earlier(nextCleanupAt, recordCleanupAt)
      }
    }
    await Promise.all(
      toExpire.map(({ key, record, response }) =>
        this.ctx.storage.put(key, {
          status: 'expired',
          command: record.command,
          response,
          createdAt: record.createdAt,
          expiredAt: now,
        } satisfies OperationRecord),
      ),
    )
    for (const { record, response } of toExpire) {
      this.resolveWaiters(record.command.operationId, response)
    }
    if (toDelete.length > 0) await this.ctx.storage.delete(toDelete)
    await this.replaceOperationCleanupSchedule(nextCleanupAt)
  }

  /** Keeps one future cleanup schedule at the earliest stored transition. */
  private async replaceOperationCleanupSchedule(nextCleanupAt: number | undefined): Promise<void> {
    const now = Date.now()
    const schedules = await this.listSchedules()
    await Promise.all(
      schedules
        .filter(
          (schedule) => schedule.callback === 'cleanupOperations' && schedule.time * 1000 > now,
        )
        .map((schedule) => this.cancelSchedule(schedule.id)),
    )

    if (nextCleanupAt !== undefined) {
      await this.schedule(
        new Date(Math.max(nextCleanupAt, now + 1_000)),
        'cleanupOperations',
        undefined,
        { idempotent: true },
      )
    }
  }

  /** Keeps an existing earlier cleanup or schedules this new record transition. */
  private async ensureOperationCleanupSchedule(cleanupAt: number): Promise<void> {
    const schedules = await this.listSchedules()
    const cleanupSchedules = schedules.filter(
      (schedule) => schedule.callback === 'cleanupOperations',
    )
    if (cleanupSchedules.some((schedule) => schedule.time * 1000 <= cleanupAt)) return

    await Promise.all(cleanupSchedules.map((schedule) => this.cancelSchedule(schedule.id)))

    await this.schedule(new Date(cleanupAt), 'cleanupOperations', undefined, { idempotent: true })
  }

  /** Removes every recurring host liveness check after the Mac disconnects. */
  private async cancelHostLivenessSchedules(): Promise<void> {
    const schedules = await this.listSchedules()
    await Promise.all(
      schedules
        .filter((schedule) => schedule.callback === HOST_LIVENESS_CALLBACK)
        .map((schedule) => this.cancelSchedule(schedule.id)),
    )
  }

  /** Loads one typed operation record from trusted Agent storage. */
  private async readOperation(operationId: OperationId): Promise<OperationRecord | undefined> {
    return await this.ctx.storage.get<OperationRecord>(operationKey(operationId))
  }

  /** Resolves every active caller for one operation. */
  private resolveWaiters(operationId: OperationId, response: HostCommandResponse): void {
    for (const waiter of this.operationWaiters.get(operationId) ?? []) waiter(response)
  }

  /** Releases all active callers when no Mac socket remains. */
  private resolveAllWaitersWithHostOffline(): void {
    for (const [operationId, waiters] of this.operationWaiters) {
      for (const waiter of waiters) waiter(hostOffline(operationId))
    }
  }

  /** Finds the one open Mac socket by its durable connection tag. */
  private hostConnection(): Connection<HostConnectionState> | undefined {
    for (const connection of this.getConnections<HostConnectionState>(HOST_CONNECTION_TAG)) {
      if (connection.readyState === WebSocket.OPEN) return connection
    }
    return undefined
  }

  /** Checks the durable attachment instead of trusting the incoming frame. */
  private isHostConnection(connection: Connection): boolean {
    return connection.tags.includes(HOST_CONNECTION_TAG)
  }

  /** Persists and broadcasts host status only when its value changes. */
  private setHostStatus(hostStatus: HostRelayState['hostStatus']): void {
    if (this.state.hostStatus === hostStatus) return
    this.setState({ ...this.state, hostStatus })
  }

  /** Publishes one idempotent list activity change through Agent state. */
  private publishConversationActivity(input: Parameters<typeof reduceHostRelayActivity>[1]): void {
    const next = reduceHostRelayActivity(this.state, input)
    if (next !== this.state) this.setState(next)
  }

  /** Publishes a new invalidation token after a catalog mutation. */
  private bumpCatalogRevision(): void {
    this.setState({ ...this.state, catalogRevision: this.state.catalogRevision + 1 })
  }

  /** Records host activity through the shared application command. */
  private async rememberSeen(hostId: HostId): Promise<void> {
    await recordHostSeen(this.resources.hostRepository, hostId, new Date())
  }

  /** Starts host activity recording and owns its final error log. */
  private recordHostSeen(hostId: HostId): void {
    void this.rememberSeen(hostId).catch((error) => {
      logger.error('host_seen_failed', { error, details: { hostId } })
    })
  }
}

/** Parses one text frame against the complete Mac-to-relay protocol. */
function parseHostMessage(frame: string) {
  try {
    return HostToRelayMessageSchema.safeParse(JSON.parse(frame))
  } catch {
    return HostToRelayMessageSchema.safeParse(undefined)
  }
}

/** Names one durable operation record without a second index. */
function operationKey(operationId: OperationId): string {
  return `${OPERATION_PREFIX}${operationId}`
}

function conversationAccessKey(conversationId: ConversationId): string {
  return `${CONVERSATION_ACCESS_PREFIX}${conversationId}`
}

function conversationConnectionTag(conversationId: ConversationId): string {
  return `conversation:${conversationId}`
}

/** Detects illegal reuse of one operation identifier with different command data. */
function sameCommand(left: HostCommand, right: HostCommand): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Registers one active caller for a durable operation. */
function addWaiter(
  waiters: Map<OperationId, Set<OperationWaiter>>,
  operationId: OperationId,
  waiter: OperationWaiter,
): void {
  const operationWaiters = waiters.get(operationId) ?? new Set()
  operationWaiters.add(waiter)
  waiters.set(operationId, operationWaiters)
}

/** Removes one caller and deletes an empty waiter set. */
function removeWaiter(
  waiters: Map<OperationId, Set<OperationWaiter>>,
  operationId: OperationId,
  waiter: OperationWaiter,
): void {
  const operationWaiters = waiters.get(operationId)
  if (operationWaiters === undefined) return

  operationWaiters.delete(waiter)
  if (operationWaiters.size === 0) waiters.delete(operationId)
}

// TEMPORARY: The host WebSocket error contract is not decided; these mappings preserve the current protocol.
/** Rebuilds the errors declared by the transcript RPC method. */
function throwConversationReadError(error: PorteErrorPayload): never {
  switch (error._tag) {
    case 'HostOfflineError':
      throw new HostOfflineError()
    case 'RequestTimeoutError':
      throw new RequestTimeoutError()
    case 'ConversationNotFoundError':
      throw new ConversationNotFoundError()
    default:
      throw new InternalServerError()
  }
}

/** Rebuilds the errors declared by the turn start RPC method. */
function throwTurnStartError(error: PorteErrorPayload): never {
  switch (error._tag) {
    case 'HostOfflineError':
      throw new HostOfflineError()
    case 'RequestTimeoutError':
      throw new RequestTimeoutError()
    case 'ConversationNotFoundError':
      throw new ConversationNotFoundError()
    case 'ConversationBusyError':
      throw new ConversationBusyError()
    case 'OperationConflictError':
      throw new OperationConflictError()
    case 'OperationExpiredError':
      throw new OperationExpiredError()
    default:
      throw new InternalServerError()
  }
}

/** Builds the typed response for an operation attempted without a Mac. */
function hostOffline(operationId: OperationId): HostCommandResponse {
  return {
    v: 2,
    type: 'command.error',
    operationId,
    error: toErrorPayload(new HostOfflineError()),
  }
}

/** Builds the transient response that releases a slow active caller. */
function commandTimeout(operationId: OperationId): HostCommandResponse {
  return {
    v: 2,
    type: 'command.error',
    operationId,
    error: toErrorPayload(new RequestTimeoutError()),
  }
}

/** Builds the terminal response for illegal operation identifier reuse. */
function operationConflict(operationId: OperationId): HostCommandResponse {
  return {
    v: 2,
    type: 'command.error',
    operationId,
    error: toErrorPayload(new OperationConflictError()),
  }
}

/** Builds the terminal tombstone response for an undelivered operation. */
function operationExpired(operationId: OperationId): HostCommandResponse {
  return {
    v: 2,
    type: 'command.error',
    operationId,
    error: toErrorPayload(new OperationExpiredError()),
  }
}

/** Selects the earlier cleanup time without a sentinel value. */
function earlier(current: number | undefined, candidate: number): number {
  return current === undefined ? candidate : Math.min(current, candidate)
}
