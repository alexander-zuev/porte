import { homedir } from 'node:os'

import {
  PROTOCOL_VERSION,
  type AgentCapabilities,
  type ContentBlock,
  type JsonRpcId,
  type LoadSessionResponse,
  type NewSessionResponse,
} from '@agentclientprotocol/sdk'
import { startAcpClient, type AcpClient, type StartAcpClient } from '@host/adapters/acp/client.ts'
import {
  answerIncomingRequest,
  parsePermissionRequest,
} from '@host/adapters/acp/incoming-request.ts'
import type { JsonRpcError, JsonValue } from '@host/adapters/acp/message.ts'
import { applyConversationEvents } from '@host/application/conversation-view-reducer.ts'
import {
  CodingAgentError,
  type AnswerPermission,
  type CancelTurn,
  type CodingAgent,
  type ConversationEvent,
  type ConversationEmission,
  type ConversationId,
  type ConversationIdentity,
  type ConversationSnapshot,
  type ConversationSummary,
  type ConversationTranscript,
  type ConversationTurnState,
  type CreateConversation,
  type CreatedConversation,
  type OpenConversation,
  type ReadConversation,
  type StartTurn,
} from '@host/application/ports/coding-agent.ts'
import {
  IsoDateTimeSchema,
  ConversationIdSchema,
  PermissionIdSchema,
  conversationStateSnapshot,
  makeConversationSummary,
  type CanonicalContent,
  type PermissionId,
  type TurnId,
} from '@porte/core/client'
import {
  ConversationViewSchema,
  type CodingAgentError as CanonicalCodingAgentError,
  type ConversationView,
} from '@porte/core/client'
import { Result, type Result as ResultType } from 'better-result'

import { findGitRoot, normaliseGitRoot } from './git-root.ts'
import {
  GrokEventMapper,
  GrokReplayMapper,
  type GrokEventMappingError,
} from './grok-event-mapper.ts'
import { listGrokSessions } from './grok-session-list.ts'
import { conversationViewToStoredTurns, pageOfTurns, type StoredTurn } from './grok-transcript.ts'

export type GrokAgentConfig = {
  readonly grokHome: string
}

type AcpProcess = Pick<AcpClient, 'request' | 'notify' | 'stop'>
type PendingPermission = {
  readonly turnId: TurnId
  readonly optionIds: ReadonlySet<string>
  readonly resolve: (result: ResultType<JsonValue, JsonRpcError>) => void
}
type AcpResourceLink = {
  type: 'resource_link'
  uri: string
  name: string
  title?: string
  description?: string
  mimeType?: string
  size?: number
}
type AcpEmbeddedResource =
  | { uri: string; mimeType?: string; text: string }
  | { uri: string; mimeType?: string; blob: string }
type StartedConversation = {
  readonly conversation: GrokConversation
  readonly view: ConversationView
}
type SelectedSession = {
  readonly conversationId: ConversationId
  readonly response: LoadSessionResponse | NewSessionResponse
}
type CachedTranscript = {
  readonly conversation: ConversationIdentity
  readonly turns: readonly StoredTurn[]
  readonly state: ReturnType<typeof conversationStateSnapshot>
}

/** Implements all coding-agent operations for Grok. */
export class GrokAgent implements CodingAgent {
  private readonly conversations = new Map<ConversationId, GrokConversation>()
  private readonly history = new Map<ConversationId, CachedTranscript>()
  private readonly opening = new Map<
    ConversationId,
    Promise<ResultType<StartedConversation, CodingAgentError>>
  >()

  constructor(config: GrokAgentConfig) {
    void config
  }

  /**
   * List conversations that Grok itself indexed.
   *
   * Asks Grok rather than reading its files: `session/list` carries the
   * repository each session was started in, and the files on disk do not.
   */
  async listConversations(): Promise<ResultType<ConversationSummary[], CodingAgentError>> {
    const client = await startControlClient()
    if (client.isErr()) return Result.err(client.error)

    const listed = await listGrokSessions(client.value)
    await client.value.stop()
    if (listed.isOk()) return Result.ok(listed.value)
    return Result.err(
      operationError(
        'list',
        listed.error,
        listed.error.kind === 'unreachable' ? 'PROVIDER_UNAVAILABLE' : 'INVALID_PROVIDER_RESPONSE',
      ),
    )
  }

  /** Lists only turns backed by a live ACP process in this host process. */
  activeTurns() {
    return [...this.conversations.entries()].flatMap(([conversationId, conversation]) =>
      conversation.turn.state === 'running'
        ? [{ conversationId, turnId: conversation.turn.turnId }]
        : [],
    )
  }

  /** Read one stored conversation from ACP session/load replay updates. */
  async readConversation(
    command: ReadConversation,
  ): Promise<ResultType<ConversationTranscript, CodingAgentError>> {
    let transcript = command.cursor === null ? undefined : this.history.get(command.conversationId)
    if (transcript === undefined) {
      const identity = await this.findConversation(command.conversationId, 'read')
      if (identity.isErr()) return identity
      const loaded = await this.loadConversation(identity.value, () => undefined, 'read')
      if (loaded.isErr()) return loaded
      transcript = {
        conversation: identity.value,
        turns: conversationViewToStoredTurns(loaded.value.view),
        state: conversationStateSnapshot(loaded.value.view, { state: 'idle' }),
      }
      this.history.set(command.conversationId, transcript)
      await loaded.value.conversation.close()
    }

    const page = pageOfTurns(transcript.turns, command.cursor, command.limit)
    if (page.isErr()) {
      return Result.err(operationError('read', page.error, 'INVALID_PROVIDER_RESPONSE'))
    }

    return Result.ok({
      conversation: transcript.conversation,
      state: this.conversations.get(command.conversationId)?.state ?? transcript.state,
      ...page.value,
    })
  }

  /** Load one Grok conversation and keep its ACP process active. */
  async openConversation(
    command: OpenConversation,
  ): Promise<ResultType<ConversationSnapshot, CodingAgentError>> {
    const found = await this.findConversation(command.conversationId, 'open')
    if (found.isErr()) return found

    const current = this.conversations.get(command.conversationId)
    if (current !== undefined) {
      current.setListener(command.onEvent)
      return Result.ok(snapshot(found.value, current.view, current.turn))
    }

    let pending = this.opening.get(command.conversationId)
    if (pending === undefined) {
      pending = this.startConversation(
        found.value.cwd,
        command.onEvent,
        'open',
        async (client, capabilities) => {
          if (capabilities.loadSession !== true) {
            return Result.err(unsupportedCapability('open', 'session/load'))
          }
          const loaded = await client.request({
            method: 'session/load',
            params: {
              sessionId: command.conversationId,
              cwd: found.value.cwd,
              mcpServers: [],
            },
            timeoutMs: 30_000,
          })
          return loaded.isErr()
            ? Result.err(operationError('open', loaded.error))
            : Result.ok({ conversationId: command.conversationId, response: loaded.value })
        },
      )
      this.opening.set(command.conversationId, pending)
    }
    const started = await pending
    this.opening.delete(command.conversationId)
    if (started.isErr()) return started

    started.value.conversation.setListener(command.onEvent)
    this.conversations.set(command.conversationId, started.value.conversation)
    return Result.ok(snapshot(found.value, started.value.view, started.value.conversation.turn))
  }

  /** Create one Grok conversation and keep its ACP process active. */
  async createConversation(
    command: CreateConversation,
  ): Promise<ResultType<CreatedConversation, CodingAgentError>> {
    // Resolved before anything starts. A conversation outside a repository has
    // nowhere to appear in the list, so the honest answer is to refuse rather
    // than to create one nobody will find again.
    const gitRoot = findGitRoot(command.cwd)
    if (gitRoot === undefined) {
      return Result.err(operationError('create', undefined, 'NOT_A_REPOSITORY'))
    }

    const started = await this.startConversation(
      command.cwd,
      command.onEvent,
      'create',
      async (client) => {
        const created = await client.request({
          method: 'session/new',
          params: { cwd: command.cwd, mcpServers: [] },
          timeoutMs: 30_000,
        })
        if (created.isErr()) return Result.err(operationError('create', created.error))
        return Result.ok({
          conversationId: ConversationIdSchema.parse(created.value.sessionId),
          response: created.value,
        })
      },
    )
    if (started.isErr()) return started

    const summary = makeConversationSummary({
      id: started.value.conversation.conversationId,
      cwd: command.cwd,
      gitRoot: normaliseGitRoot(gitRoot),
      title: '',
      updatedAt: IsoDateTimeSchema.parse(new Date().toISOString()),
    })
    await started.value.conversation.close()
    return Result.ok({
      summary,
      state: conversationStateSnapshot(started.value.view, started.value.conversation.turn),
    })
  }

  /** Close one active Grok conversation. */
  async closeConversation(
    conversationId: ConversationId,
  ): Promise<ResultType<void, CodingAgentError>> {
    const conversation = this.conversations.get(conversationId)
    if (conversation === undefined) {
      return Result.err(operationError('close', undefined, 'CONVERSATION_NOT_OPEN'))
    }
    const closed = await conversation.close()
    if (closed.isOk()) this.conversations.delete(conversationId)
    return closed
  }

  /** Start one turn in an active Grok conversation. */
  startTurn(command: StartTurn): Promise<ResultType<void, CodingAgentError>> {
    const conversation = this.conversations.get(command.conversationId)
    return conversation === undefined
      ? Promise.resolve(
          Result.err(operationError('start_turn', undefined, 'CONVERSATION_NOT_OPEN')),
        )
      : conversation.startTurn(command)
  }

  /** Cancel the active turn in one Grok conversation. */
  cancelTurn(command: CancelTurn): Promise<ResultType<void, CodingAgentError>> {
    const conversation = this.conversations.get(command.conversationId)
    return conversation === undefined
      ? Promise.resolve(
          Result.err(operationError('cancel_turn', undefined, 'CONVERSATION_NOT_OPEN')),
        )
      : conversation.cancelTurn(command.turnId)
  }

  /** Answer one pending Grok permission request. */
  answerPermission(command: AnswerPermission): Promise<ResultType<void, CodingAgentError>> {
    const conversation = this.conversations.get(command.conversationId)
    return conversation === undefined
      ? Promise.resolve(
          Result.err(operationError('answer_permission', undefined, 'CONVERSATION_NOT_OPEN')),
        )
      : conversation.answerPermission(command)
  }

  private async findConversation(
    conversationId: ConversationId,
    operation: 'read' | 'open',
  ): Promise<ResultType<ConversationIdentity, CodingAgentError>> {
    const listed = await this.listConversations()
    if (listed.isErr()) return Result.err(operationError(operation, listed.error))
    const found = listed.value.find((conversation) => conversation.id === conversationId)
    return found === undefined
      ? Result.err(operationError(operation, undefined, 'CONVERSATION_NOT_FOUND'))
      : Result.ok(found)
  }

  private loadConversation(
    identity: ConversationIdentity,
    onEvent: (emission: ConversationEmission) => void,
    operation: 'read' | 'open',
  ): Promise<ResultType<StartedConversation, CodingAgentError>> {
    return this.startConversation(
      identity.cwd,
      onEvent,
      operation,
      async (client, capabilities) => {
        if (capabilities.loadSession !== true) {
          return Result.err(unsupportedCapability(operation, 'session/load'))
        }
        const loaded = await client.request({
          method: 'session/load',
          params: { sessionId: identity.id, cwd: identity.cwd, mcpServers: [] },
          timeoutMs: 30_000,
        })
        return loaded.isErr()
          ? Result.err(operationError(operation, loaded.error))
          : Result.ok({ conversationId: identity.id, response: loaded.value })
      },
    )
  }

  private async startConversation(
    cwd: string,
    onEvent: (emission: ConversationEmission) => void,
    operation: 'read' | 'open' | 'create',
    selectConversation: (
      client: AcpProcess,
      capabilities: AgentCapabilities,
    ) => Promise<ResultType<SelectedSession, CodingAgentError>>,
  ): Promise<ResultType<StartedConversation, CodingAgentError>> {
    let conversation: GrokConversation | undefined
    let replayError: GrokEventMappingError | undefined
    const replay = new GrokReplayMapper()
    const started = await startAcpClient({
      command: 'grok',
      args: ['--no-auto-update', 'agent', 'stdio'],
      cwd,
      onUpdate: (notification) => {
        if (conversation !== undefined) {
          conversation.receiveUpdate(notification)
          return
        }
        if (replayError !== undefined) return
        const mapped = replay.map(notification)
        if (mapped.isErr()) replayError = mapped.error
      },
      onRequest: (id, method, params) =>
        conversation === undefined
          ? answerIncomingRequest(cwd, method, params)
          : conversation.answerIncoming(id, method, params),
    })
    if (started.isErr()) return Result.err(operationError(operation, started.error))

    const client = started.value
    const prepared = await prepareClient(client, operation)
    if (prepared.isErr()) {
      await client.stop()
      return prepared
    }
    const selected = await selectConversation(client, prepared.value)
    if (selected.isErr()) {
      await client.stop()
      return selected
    }

    if (replayError !== undefined) {
      await client.stop()
      return Result.err(operationError(operation, replayError, 'INVALID_PROVIDER_RESPONSE'))
    }
    replay.seedSession(selected.value.response)
    const view = replay.snapshot(selected.value.conversationId)
    if (view.isErr()) {
      await client.stop()
      return Result.err(operationError(operation, view.error, 'INVALID_PROVIDER_RESPONSE'))
    }

    conversation = new GrokConversation(
      selected.value.conversationId,
      client,
      cwd,
      onEvent,
      view.value,
      prepared.value,
      () => {
        if (this.conversations.get(selected.value.conversationId) !== conversation) return
        this.conversations.delete(selected.value.conversationId)
        this.history.delete(selected.value.conversationId)
      },
    )
    return Result.ok({ conversation, view: view.value })
  }
}

/** Internal state for one ACP process owned by GrokAgent. */
class GrokConversation {
  private mapper: GrokEventMapper | undefined
  private activeTurnId: TurnId | undefined
  private closed = false
  private currentView: ConversationView
  private listener: (emission: ConversationEmission) => void
  private readonly permissions = new Map<PermissionId, PendingPermission>()

  constructor(
    readonly conversationId: ConversationId,
    private readonly client: AcpProcess,
    private readonly cwd: string,
    onEvent: (emission: ConversationEmission) => void,
    view: ConversationView,
    private readonly capabilities: AgentCapabilities,
    private readonly onClosed: () => void,
  ) {
    this.currentView = ConversationViewSchema.parse(view)
    this.listener = onEvent
  }

  get view(): ConversationView {
    return ConversationViewSchema.parse(this.currentView)
  }

  get state() {
    return conversationStateSnapshot(this.currentView, this.turn)
  }

  /** What this conversation is doing now, which no stored file records. */
  get turn(): ConversationTurnState {
    return this.activeTurnId === undefined
      ? { state: 'idle' }
      : { state: 'running', turnId: this.activeTurnId }
  }

  setListener(listener: (emission: ConversationEmission) => void): void {
    this.listener = listener
  }

  async startTurn(command: StartTurn): Promise<ResultType<void, CodingAgentError>> {
    if (this.closed) {
      return Result.err(operationError('start_turn', undefined, 'CONVERSATION_NOT_OPEN'))
    }
    if (this.activeTurnId !== undefined) {
      return Result.err(operationError('start_turn', undefined, 'CONVERSATION_BUSY'))
    }

    const mapper = new GrokEventMapper(this.conversationId, command.turnId)
    const started = mapper.start(command.userMessage)
    if (started.isErr()) {
      return Result.err(operationError('start_turn', started.error, 'INVALID_PROVIDER_RESPONSE'))
    }
    this.mapper = mapper
    this.activeTurnId = command.turnId
    const sent = this.send(started.value, 'start_turn')
    if (sent.isErr()) {
      this.mapper = undefined
      this.activeTurnId = undefined
      await this.close()
      return sent
    }
    void this.executeTurn(command, mapper)
    return Result.ok()
  }

  async cancelTurn(turnId: TurnId): Promise<ResultType<void, CodingAgentError>> {
    const mapper = this.mapper
    if (this.activeTurnId !== turnId || mapper === undefined) {
      return Result.err(operationError('cancel_turn', undefined, 'CONVERSATION_NOT_OPEN'))
    }
    const cancelled = await this.client.notify({
      method: 'session/cancel',
      params: { sessionId: this.conversationId },
    })
    if (cancelled.isErr()) return Result.err(operationError('cancel_turn', cancelled.error))
    for (const [permissionId, pending] of this.permissions) {
      if (pending.turnId !== turnId) continue
      const mapped = mapper.permissionCancelled(permissionId)
      if (mapped.isErr()) {
        return Result.err(operationError('cancel_turn', mapped.error, 'INVALID_PROVIDER_RESPONSE'))
      }
      const sent = this.send(mapped.value, 'cancel_turn')
      this.permissions.delete(permissionId)
      pending.resolve(Result.ok({ outcome: { outcome: 'cancelled' } }))
      if (sent.isErr()) return sent
    }
    return Result.ok()
  }

  async answerPermission(command: AnswerPermission): Promise<ResultType<void, CodingAgentError>> {
    const pending = this.permissions.get(command.permissionId)
    if (
      pending === undefined ||
      pending.turnId !== command.turnId ||
      !pending.optionIds.has(command.optionId)
    ) {
      return Result.err(operationError('answer_permission', undefined, 'PERMISSION_NOT_FOUND'))
    }
    const mapped = this.mapper?.permissionResolved(command.permissionId, command.optionId)
    if (mapped === undefined || mapped.isErr()) {
      return Result.err(
        operationError(
          'answer_permission',
          mapped?.error,
          mapped === undefined ? 'CONVERSATION_NOT_OPEN' : 'INVALID_PROVIDER_RESPONSE',
        ),
      )
    }

    const sent = this.send(mapped.value, 'answer_permission')
    if (sent.isErr()) return sent
    this.permissions.delete(command.permissionId)
    pending.resolve(Result.ok({ outcome: { outcome: 'selected', optionId: command.optionId } }))
    return Result.ok()
  }

  async close(): Promise<ResultType<void, CodingAgentError>> {
    if (this.closed) return Result.ok()
    this.closed = true
    if (this.activeTurnId !== undefined) {
      await this.client.notify({
        method: 'session/cancel',
        params: { sessionId: this.conversationId },
      })
    }
    for (const pending of this.permissions.values()) {
      pending.resolve(Result.ok({ outcome: { outcome: 'cancelled' } }))
    }
    this.permissions.clear()
    let closeError: CodingAgentError | undefined
    if (
      this.capabilities.sessionCapabilities?.close !== undefined &&
      this.capabilities.sessionCapabilities.close !== null
    ) {
      const closed = await this.client.request({
        method: 'session/close',
        params: { sessionId: this.conversationId },
        timeoutMs: 30_000,
      })
      if (closed.isErr()) closeError = operationError('close', closed.error)
    }
    await this.client.stop()
    this.onClosed()
    return closeError === undefined ? Result.ok() : Result.err(closeError)
  }

  receiveUpdate(notification: Parameters<StartAcpClient['onUpdate']>[0]): void {
    const mapped = this.mapper?.map(notification)
    if (mapped === undefined) return
    if (mapped.isErr()) {
      this.failTurn(invalidUpdate())
      return
    }
    const sent = this.send(mapped.value, 'start_turn')
    if (sent.isErr()) {
      this.failTurn(invalidUpdate())
    }
  }

  answerIncoming(
    requestId: JsonRpcId,
    method: string,
    params: JsonValue | undefined,
  ): Promise<ResultType<JsonValue, JsonRpcError>> {
    if (method !== 'session/request_permission') {
      return answerIncomingRequest(this.cwd, method, params)
    }
    const parsed = parsePermissionRequest(params)
    if (parsed.isErr()) return Promise.resolve(parsed)
    if (this.mapper === undefined || this.activeTurnId === undefined) {
      return Promise.resolve(Result.err({ code: -32600, message: 'no active turn' }))
    }

    const permissionId = PermissionIdSchema.parse(
      `${this.activeTurnId}:permission:${String(requestId)}`,
    )
    const mapped = this.mapper.permissionRequested({
      permissionId,
      toolCallId: parsed.value.toolCall.toolCallId,
      title: parsed.value.toolCall.title ?? '',
      options: parsed.value.options,
    })
    if (mapped.isErr()) {
      return Promise.resolve(Result.err({ code: -32603, message: mapped.error.message }))
    }
    const sent = this.send(mapped.value, 'start_turn')
    if (sent.isErr()) {
      return Promise.resolve(Result.err({ code: -32603, message: sent.error.message }))
    }
    const turnId = this.activeTurnId
    return new Promise((resolve) => {
      this.permissions.set(permissionId, {
        turnId,
        optionIds: new Set(parsed.value.options.map((option) => option.optionId)),
        resolve,
      })
    })
  }

  private async executeTurn(command: StartTurn, mapper: GrokEventMapper): Promise<void> {
    const response = await this.client.request({
      method: 'session/prompt',
      params: {
        sessionId: this.conversationId,
        prompt: command.userMessage.content.map(toAcpContent),
      },
      timeoutMs: 1_800_000,
    })
    if (response.isErr()) {
      if (!this.closed) this.failTurn(codingAgentUnavailable())
      return
    }
    const finished = mapper.finish(response.value.stopReason)
    if (finished.isErr()) {
      this.failTurn(invalidUpdate())
      return
    }
    const sent = this.send(finished.value, 'start_turn')
    if (sent.isErr()) {
      this.failTurn(invalidUpdate())
      return
    }
    this.activeTurnId = undefined
    this.mapper = undefined
    await this.close()
  }

  private failTurn(error: CanonicalCodingAgentError): void {
    const failed = this.mapper?.fail(error)
    if (failed?.isOk()) void this.send(failed.value, 'start_turn')
    this.activeTurnId = undefined
    this.mapper = undefined
    void this.close()
  }

  private send(
    events: readonly ConversationEvent[],
    operation: CodingAgentError['operation'],
  ): ResultType<void, CodingAgentError> {
    const next = applyConversationEvents(this.currentView, events)
    if (next.isErr()) {
      return Result.err(operationError(operation, next.error, 'INVALID_PROVIDER_RESPONSE'))
    }
    this.currentView = next.value
    for (const event of events) this.listener({ conversationId: this.conversationId, event })
    return Result.ok()
  }
}

/**
 * Start the Grok process that answers questions about no conversation.
 *
 * Runs from the home directory because `session/list` spans every repository
 * and picking one of them would read as a scope it does not have. Updates and
 * incoming requests are refused: without a session there is nothing to answer
 * them on behalf of.
 */
async function startControlClient(): Promise<ResultType<AcpProcess, CodingAgentError>> {
  const started = await startAcpClient({
    command: 'grok',
    args: ['--no-auto-update', 'agent', 'stdio'],
    cwd: homedir(),
    onUpdate: () => undefined,
    onRequest: (_id, method) =>
      Promise.resolve(Result.err({ code: -32601, message: `method not found: ${method}` })),
  })
  if (started.isErr()) return Result.err(operationError('list', started.error))

  const prepared = await prepareClient(started.value, 'list')
  if (prepared.isErr()) {
    await started.value.stop()
    return Result.err(prepared.error)
  }
  if (
    prepared.value.sessionCapabilities?.list === undefined ||
    prepared.value.sessionCapabilities.list === null
  ) {
    await started.value.stop()
    return Result.err(unsupportedCapability('list', 'session/list'))
  }
  return Result.ok(started.value)
}

async function prepareClient(
  client: AcpProcess,
  operation: 'read' | 'open' | 'create' | 'list',
): Promise<ResultType<AgentCapabilities, CodingAgentError>> {
  const initialized = await client.request({
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        plan: {},
        session: { configOptions: { boolean: {} } },
      },
      clientInfo: { name: 'porte', title: 'Porte', version: '0.1.0' },
    },
    timeoutMs: 30_000,
  })
  if (initialized.isErr()) return Result.err(operationError(operation, initialized.error))
  if (initialized.value.protocolVersion !== PROTOCOL_VERSION) {
    return Result.err(operationError(operation, undefined, 'INVALID_PROVIDER_RESPONSE'))
  }

  const cachedToken = initialized.value.authMethods?.find(
    (method) => !('type' in method) && method.id === 'cached_token',
  )
  if (cachedToken !== undefined) {
    const authenticated = await client.request({
      method: 'authenticate',
      params: { methodId: cachedToken.id, _meta: { headless: true } },
      timeoutMs: 30_000,
    })
    if (authenticated.isErr()) return Result.err(operationError(operation, authenticated.error))
  }
  return Result.ok(initialized.value.agentCapabilities ?? {})
}

function snapshot(
  summary: ConversationIdentity,
  view: ConversationView,
  turn: ConversationTurnState,
): ConversationSnapshot {
  return { summary, state: conversationStateSnapshot(view, turn) }
}

function toAcpContent(content: CanonicalContent): ContentBlock {
  if (content.type === 'resource-link') {
    const link: AcpResourceLink = {
      type: 'resource_link',
      uri: content.uri,
      name: content.name,
    }
    if (content.title !== undefined) link.title = content.title
    if (content.description !== undefined) link.description = content.description
    if (content.mimeType !== undefined) link.mimeType = content.mimeType
    if (content.size !== undefined) link.size = content.size
    return link
  }
  if (content.type !== 'resource') return content

  const resource = content.resource
  const embedded: AcpEmbeddedResource =
    resource.content.type === 'text'
      ? { uri: resource.uri, text: resource.content.text }
      : { uri: resource.uri, blob: resource.content.data }
  if (resource.mimeType !== undefined) embedded.mimeType = resource.mimeType
  return {
    type: 'resource',
    resource: embedded,
  }
}

function codingAgentUnavailable(): CanonicalCodingAgentError {
  return {
    code: 'CODING_AGENT_UNAVAILABLE',
    message: 'Grok stopped before the turn completed.',
  }
}

function invalidUpdate(): CanonicalCodingAgentError {
  return { code: 'INTERNAL_ERROR', message: 'Grok returned an invalid conversation update.' }
}

function operationError(
  operation: CodingAgentError['operation'],
  cause: unknown,
  code: CodingAgentError['code'] = 'PROVIDER_UNAVAILABLE',
): CodingAgentError {
  const message =
    operation === 'list'
      ? 'Grok conversations are unavailable.'
      : operation === 'open'
        ? 'Grok could not open the conversation.'
        : operation === 'create'
          ? 'Grok could not create the conversation.'
          : `Grok could not ${operation.replace('_', ' ')}.`
  return new CodingAgentError({ code, operation, cause, message })
}

function unsupportedCapability(
  operation: CodingAgentError['operation'],
  capability: string,
): CodingAgentError {
  return operationError(
    operation,
    new TypeError(`Grok does not advertise ${capability}`),
    'INVALID_PROVIDER_RESPONSE',
  )
}
