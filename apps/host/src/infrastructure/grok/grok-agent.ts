import { homedir } from 'node:os'

import {
  PROTOCOL_VERSION,
  type AgentCapabilities,
  type ContentBlock,
  type CreateElicitationResponse,
  type JsonRpcId,
  type LoadSessionResponse,
  type NewSessionResponse,
} from '@agentclientprotocol/sdk'
import {
  CodingAgentError,
  type AnswerPermission,
  type AnswerElicitation,
  type CancelTurn,
  type CodingAgent,
  type ConversationEvent,
  type ConversationEmission,
  type ConversationId,
  type CreateConversation,
  type OpenConversation,
  type SetConfiguration,
  type StartTurn,
} from '@host/application/ports/coding-agent.ts'
import { applyConversationEvents } from '@host/domain/conversation/conversation-view-reducer.ts'
import {
  startAcpClient,
  type AcpClient,
  type StartAcpClient,
} from '@host/infrastructure/acp/client.ts'
import {
  answerIncomingRequest,
  parseElicitationRequest,
  parsePermissionRequest,
} from '@host/infrastructure/acp/incoming-request.ts'
import type { JsonRpcError, JsonValue } from '@host/infrastructure/acp/message.ts'
import {
  ConversationIdSchema,
  ElicitationIdSchema,
  IsoDateTimeSchema,
  PermissionIdSchema,
  makeConversation,
  makeConversationState,
  type CanonicalContent,
  type Conversation,
  type ConversationState,
  type ConversationTurnState,
  type ElicitationId,
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
  mapGrokConfiguration,
  type GrokEventMappingError,
} from './grok-event-mapper.ts'
import { listGrokSessions } from './grok-session-list.ts'

export type GrokAgentConfig = {
  readonly grokHome: string
}

type AcpProcess = Pick<AcpClient, 'request' | 'notify' | 'stop'>
type PendingPermission = {
  readonly turnId: TurnId
  readonly optionIds: ReadonlySet<string>
  readonly resolve: (result: ResultType<JsonValue, JsonRpcError>) => void
}
type PendingElicitation = {
  readonly turnId: TurnId
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
/** Implements all coding-agent operations for Grok. */
export class GrokAgent implements CodingAgent {
  private readonly conversations = new Map<ConversationId, GrokConversation>()
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
  async listConversations(): Promise<ResultType<Conversation[], CodingAgentError>> {
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

  /** Load one Grok conversation and keep its ACP process active. */
  async openConversation(
    command: OpenConversation,
  ): Promise<ResultType<ConversationState, CodingAgentError>> {
    const found = await this.findConversation(command.conversationId, 'open')
    if (found.isErr()) return found

    const current = this.conversations.get(command.conversationId)
    if (current !== undefined) {
      current.setListener(command.onEvent)
      return Result.ok(makeConversationState(current.view, current.turn))
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
    return Result.ok(makeConversationState(started.value.view, started.value.conversation.turn))
  }

  /** Create one Grok conversation and keep its ACP process active. */
  async createConversation(
    command: CreateConversation,
  ): Promise<ResultType<Conversation, CodingAgentError>> {
    // Resolved before anything starts. A conversation outside a repository has
    // nowhere to appear in the list, so the honest answer is to refuse rather
    // than to create one nobody will find again.
    const gitRoot = findGitRoot(command.cwd)
    if (gitRoot === undefined) {
      return Result.err(operationError('create', undefined, 'NOT_A_REPOSITORY'))
    }

    const started = await this.startConversation(
      command.cwd,
      () => undefined,
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

    const conversation = makeConversation({
      id: started.value.conversation.conversationId,
      cwd: command.cwd,
      gitRoot: normaliseGitRoot(gitRoot),
      title: '',
      updatedAt: IsoDateTimeSchema.parse(new Date().toISOString()),
    })
    await started.value.conversation.close()
    return Result.ok(conversation)
  }

  /** Close one active Grok conversation. */
  async closeConversation(
    conversationId: ConversationId,
  ): Promise<ResultType<void, CodingAgentError>> {
    const conversation = this.conversations.get(conversationId)
    if (conversation === undefined) return Result.ok()
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
      ? Promise.resolve(Result.ok())
      : conversation.cancelTurn(command.turnId)
  }

  /** Set one configuration option on an active Grok conversation. */
  setConfiguration(command: SetConfiguration): Promise<ResultType<void, CodingAgentError>> {
    const conversation = this.conversations.get(command.conversationId)
    return conversation === undefined
      ? Promise.resolve(
          Result.err(operationError('set_configuration', undefined, 'CONVERSATION_NOT_OPEN')),
        )
      : conversation.setConfiguration(command)
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

  /** Answer one pending Grok elicitation request. */
  answerElicitation(command: AnswerElicitation): Promise<ResultType<void, CodingAgentError>> {
    const conversation = this.conversations.get(command.conversationId)
    return conversation === undefined
      ? Promise.resolve(
          Result.err(operationError('answer_elicitation', undefined, 'CONVERSATION_NOT_OPEN')),
        )
      : conversation.answerElicitation(command)
  }

  private async findConversation(
    conversationId: ConversationId,
    operation: 'open',
  ): Promise<ResultType<Conversation, CodingAgentError>> {
    const listed = await this.listConversations()
    if (listed.isErr()) return Result.err(operationError(operation, listed.error))
    const found = listed.value.find((conversation) => conversation.id === conversationId)
    return found === undefined
      ? Result.err(operationError(operation, undefined, 'CONVERSATION_NOT_FOUND'))
      : Result.ok(found)
  }

  private loadConversation(
    identity: Conversation,
    onEvent: (emission: ConversationEmission) => void,
    operation: 'open',
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
    operation: 'open' | 'create',
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
      onElicitationComplete: ({ elicitationId }) => {
        conversation?.completeElicitation(ElicitationIdSchema.parse(elicitationId))
      },
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
  private readonly elicitations = new Map<ElicitationId, PendingElicitation>()
  private readonly urlCompletions = new Map<ElicitationId, TurnId>()

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
    return makeConversationState(this.currentView, this.turn)
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
    if (this.activeTurnId === command.turnId) return Result.ok()
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
    for (const [elicitationId, pending] of this.elicitations) {
      if (pending.turnId !== turnId) continue
      const sent = this.send(
        [
          {
            type: 'elicitation.resolved',
            turnId,
            elicitationId,
            outcome: { type: 'cancelled' },
          },
        ],
        'cancel_turn',
      )
      this.elicitations.delete(elicitationId)
      pending.resolve(Result.ok({ action: 'cancel' }))
      if (sent.isErr()) return sent
    }
    return Result.ok()
  }

  async setConfiguration(command: SetConfiguration): Promise<ResultType<void, CodingAgentError>> {
    const params =
      command.value.type === 'boolean'
        ? {
            sessionId: this.conversationId,
            configId: command.optionId,
            type: 'boolean' as const,
            value: command.value.value,
          }
        : {
            sessionId: this.conversationId,
            configId: command.optionId,
            value: command.value.value,
          }
    const updated = await this.client.request({
      method: 'session/set_config_option',
      params,
      timeoutMs: 30_000,
    })
    if (updated.isErr()) {
      return Result.err(operationError('set_configuration', updated.error))
    }
    return this.send(
      [
        {
          type: 'conversation.configuration.updated',
          options: mapGrokConfiguration(updated.value.configOptions),
        },
      ],
      'set_configuration',
    )
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

  async answerElicitation(command: AnswerElicitation): Promise<ResultType<void, CodingAgentError>> {
    const pending = this.elicitations.get(command.elicitationId)
    if (pending === undefined || pending.turnId !== command.turnId) {
      return Result.err(operationError('answer_elicitation', undefined, 'ELICITATION_NOT_FOUND'))
    }
    const response = elicitationResponse(command.answer)
    const outcome = elicitationOutcome(command.answer)
    const sent = this.send(
      [
        {
          type: 'elicitation.resolved',
          turnId: command.turnId,
          elicitationId: command.elicitationId,
          outcome,
        },
      ],
      'answer_elicitation',
    )
    if (sent.isErr()) return sent
    this.elicitations.delete(command.elicitationId)
    if (command.answer.type === 'accept') {
      this.urlCompletions.set(command.elicitationId, command.turnId)
    }
    pending.resolve(Result.ok(response))
    return Result.ok()
  }

  async close(): Promise<ResultType<void, CodingAgentError>> {
    if (this.closed) return Result.ok()
    this.closed = true
    let closeError: CodingAgentError | undefined
    if (this.activeTurnId !== undefined) {
      await this.client.notify({
        method: 'session/cancel',
        params: { sessionId: this.conversationId },
      })
      const finished = this.send(
        [
          {
            type: 'turn.finished',
            turnId: this.activeTurnId,
            outcome: { type: 'cancelled' },
          },
        ],
        'close',
      )
      if (finished.isErr()) closeError = finished.error
      this.activeTurnId = undefined
      this.mapper = undefined
    }
    for (const pending of this.permissions.values()) {
      pending.resolve(Result.ok({ outcome: { outcome: 'cancelled' } }))
    }
    this.permissions.clear()
    for (const pending of this.elicitations.values()) {
      pending.resolve(Result.ok({ action: 'cancel' }))
    }
    this.elicitations.clear()
    this.urlCompletions.clear()
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
    if (method === 'elicitation/create') {
      return this.answerIncomingElicitation(requestId, params)
    }
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

  completeElicitation(elicitationId: ElicitationId): void {
    const turnId = this.urlCompletions.get(elicitationId)
    if (turnId === undefined) return
    this.urlCompletions.delete(elicitationId)
    const sent = this.send(
      [{ type: 'elicitation.completed', turnId, elicitationId }],
      'answer_elicitation',
    )
    if (sent.isErr()) this.failTurn(invalidUpdate())
  }

  private answerIncomingElicitation(
    requestId: JsonRpcId,
    params: JsonValue | undefined,
  ): Promise<ResultType<JsonValue, JsonRpcError>> {
    const parsed = parseElicitationRequest(params)
    if (parsed.isErr()) return Promise.resolve(parsed)
    if (
      parsed.value.sessionId !== this.conversationId ||
      this.mapper === undefined ||
      this.activeTurnId === undefined
    ) {
      return Promise.resolve(Result.err({ code: -32600, message: 'no active turn' }))
    }
    const elicitationId = ElicitationIdSchema.parse(
      parsed.value.elicitationId ?? `${this.activeTurnId}:elicitation:${String(requestId)}`,
    )
    const sent = this.send(
      [
        {
          type: 'elicitation.requested',
          turnId: this.activeTurnId,
          elicitationId,
          request: parsed.value.request,
        },
      ],
      'start_turn',
    )
    if (sent.isErr()) {
      return Promise.resolve(Result.err({ code: -32603, message: sent.error.message }))
    }
    const turnId = this.activeTurnId
    return new Promise((resolve) => {
      this.elicitations.set(elicitationId, { turnId, resolve })
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
    if (this.closed || this.activeTurnId !== command.turnId) return
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
  operation: 'open' | 'create' | 'list',
): Promise<ResultType<AgentCapabilities, CodingAgentError>> {
  const initialized = await client.request({
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        elicitation: { form: {}, url: {} },
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

function elicitationResponse(answer: AnswerElicitation['answer']): JsonValue {
  if (answer.type === 'submit') {
    return { action: 'accept', content: answer.values } satisfies CreateElicitationResponse
  }
  if (answer.type === 'accept') {
    return { action: 'accept' } satisfies CreateElicitationResponse
  }
  return { action: answer.type } satisfies CreateElicitationResponse
}

function elicitationOutcome(
  answer: AnswerElicitation['answer'],
): Extract<ConversationEvent, { type: 'elicitation.resolved' }>['outcome'] {
  if (answer.type === 'submit') return { type: 'submitted', values: answer.values }
  if (answer.type === 'accept') return { type: 'accepted' }
  if (answer.type === 'decline') return { type: 'declined' }
  return { type: 'cancelled' }
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
