import { homedir } from 'node:os'

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
  createLogger,
  createEventId,
  createMessageId,
  createPermissionId,
  makeConversationSummary,
  type PermissionId,
  type TurnId,
} from '@porte/core/client'
import {
  ConversationViewSchema,
  type CodingAgentError as CanonicalCodingAgentError,
  type ConversationView,
} from '@porte/core/client'
import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import { findGitRoot, normaliseGitRoot } from './git-root.ts'
import { findGrokConversation } from './grok-conversation-files.ts'
import {
  GrokEventMapper,
  GrokReplayMapper,
  type GrokEventMappingError,
} from './grok-event-mapper.ts'
import { listGrokSessions } from './grok-session-list.ts'
import { pageOfTurns, readGrokTranscript } from './grok-transcript.ts'

export type GrokAgentConfig = {
  readonly grokHome: string
}

type AcpProcess = Pick<AcpClient, 'request' | 'notify' | 'stop'>
type PendingPermission = {
  readonly turnId: TurnId
  readonly optionIds: ReadonlySet<string>
  readonly resolve: (result: ResultType<JsonValue, JsonRpcError>) => void
}
type StartedConversation = {
  readonly conversation: GrokConversation
  readonly view: ConversationView
}

const logger = createLogger('grok-agent')

const ids = {
  eventId: createEventId,
  messageId: createMessageId,
  permissionId: createPermissionId,
}
const newSessionResponseSchema = z.object({ sessionId: ConversationIdSchema })
const promptResponseSchema = z.object({
  stopReason: z.enum(['end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled']),
})
/** Implements all coding-agent operations for Grok. */
export class GrokAgent implements CodingAgent {
  private readonly conversations = new Map<ConversationId, GrokConversation>()
  private readonly opening = new Map<
    ConversationId,
    Promise<ResultType<StartedConversation, CodingAgentError>>
  >()

  private control: Promise<ResultType<AcpProcess, CodingAgentError>> | undefined

  constructor(private readonly config: GrokAgentConfig) {}

  /**
   * List conversations that Grok itself indexed.
   *
   * Asks Grok rather than reading its files: `session/list` carries the
   * repository each session was started in, and the files on disk do not.
   */
  async listConversations(): Promise<ResultType<ConversationSummary[], CodingAgentError>> {
    const client = await this.controlClient()
    if (client.isErr()) return Result.err(client.error)

    const listed = await listGrokSessions(client.value)
    if (listed.isOk()) return Result.ok(listed.value)

    // A control process that stopped answering is not one to keep: dropping it
    // is what lets the next list start a live one.
    if (listed.error.kind === 'unreachable') this.control = undefined
    return Result.err(
      operationError(
        'list',
        listed.error,
        listed.error.kind === 'unreachable' ? 'PROVIDER_UNAVAILABLE' : 'INVALID_PROVIDER_RESPONSE',
      ),
    )
  }

  /**
   * Read one stored conversation from Grok's own files.
   *
   * No ACP session: starting one would boot the agent and its MCP servers just
   * to look at a transcript. Paged newest turn first, so a phone opening a long
   * conversation reads the end of it rather than all of it.
   */
  async readConversation(
    command: ReadConversation,
  ): Promise<ResultType<ConversationTranscript, CodingAgentError>> {
    const found = await findGrokConversation(this.config.grokHome, command.conversationId)
    if (found.isErr()) {
      const code =
        found.error._tag === 'GrokConversationNotFoundError'
          ? 'CONVERSATION_NOT_FOUND'
          : 'PROVIDER_UNAVAILABLE'
      return Result.err(operationError('read', found.error, code))
    }

    const transcript = await readGrokTranscript(found.value.folderPath, command.conversationId)
    if (transcript.isErr()) {
      return Result.err(operationError('read', transcript.error, 'PROVIDER_UNAVAILABLE'))
    }

    if (transcript.value.skippedLines > 0) {
      logger.warn('transcript_lines_skipped', {
        conversationId: command.conversationId,
        skippedLines: transcript.value.skippedLines,
      })
    }

    const page = pageOfTurns(transcript.value.turns, command.cursor, command.limit)
    if (page.isErr()) {
      return Result.err(operationError('read', page.error, 'INVALID_PROVIDER_RESPONSE'))
    }

    return Result.ok({
      conversation: found.value.identity,
      // The file says what was said; only a live process says what is happening.
      turn: this.conversations.get(command.conversationId)?.turn ?? { state: 'idle' },
      ...page.value,
    })
  }

  /** Load one Grok conversation and keep its ACP process active. */
  async openConversation(
    command: OpenConversation,
  ): Promise<ResultType<ConversationSnapshot, CodingAgentError>> {
    const found = await findGrokConversation(this.config.grokHome, command.conversationId)
    if (found.isErr()) {
      const code =
        found.error._tag === 'GrokConversationNotFoundError'
          ? 'CONVERSATION_NOT_FOUND'
          : 'PROVIDER_UNAVAILABLE'
      return Result.err(operationError('open', found.error, code))
    }

    const current = this.conversations.get(command.conversationId)
    if (current !== undefined) {
      current.setListener(command.onEvent)
      return Result.ok(snapshot(found.value.identity, current.view))
    }

    let pending = this.opening.get(command.conversationId)
    if (pending === undefined) {
      pending = this.startConversation(
        found.value.identity.cwd,
        command.onEvent,
        'open',
        async (client) => {
          const loaded = await client.request({
            method: 'session/load',
            params: {
              sessionId: command.conversationId,
              cwd: found.value.identity.cwd,
              mcpServers: [],
            },
            timeoutMs: 30_000,
          })
          return loaded.isErr()
            ? Result.err(operationError('open', loaded.error))
            : Result.ok(command.conversationId)
        },
      )
      this.opening.set(command.conversationId, pending)
    }
    const started = await pending
    this.opening.delete(command.conversationId)
    if (started.isErr()) return started

    started.value.conversation.setListener(command.onEvent)
    this.conversations.set(command.conversationId, started.value.conversation)
    return Result.ok(snapshot(found.value.identity, started.value.view))
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
        const parsed = newSessionResponseSchema.safeParse(created.value)
        return parsed.success
          ? Result.ok(parsed.data.sessionId)
          : Result.err(operationError('create', parsed.error, 'INVALID_PROVIDER_RESPONSE'))
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
    this.conversations.set(started.value.conversation.conversationId, started.value.conversation)
    return Result.ok({ summary, view: started.value.view })
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

  /**
   * One Grok process for the questions that belong to no conversation.
   *
   * Listing needs an agent, and starting one per list would pay for a process
   * and its MCP servers on every look at the list. The daemon already outlives
   * every request, so it holds the connection instead.
   *
   * Started once and shared. The promise is cached, not the client, so two
   * lists that race start one process between them.
   */
  private async controlClient(): Promise<ResultType<AcpProcess, CodingAgentError>> {
    this.control ??= startControlClient()
    const client = await this.control
    // Nothing is cached but success: a Mac that had Grok closed the first time
    // must not be told so for the rest of the day.
    if (client.isErr()) this.control = undefined
    return client
  }

  private async startConversation(
    cwd: string,
    onEvent: (event: ConversationEvent) => void,
    operation: 'open' | 'create',
    selectConversation: (
      client: AcpProcess,
    ) => Promise<ResultType<ConversationId, CodingAgentError>>,
  ): Promise<ResultType<StartedConversation, CodingAgentError>> {
    let conversation: GrokConversation | undefined
    let replayError: GrokEventMappingError | undefined
    const replay = new GrokReplayMapper(ids)
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
      onRequest: (method, params) =>
        conversation === undefined
          ? answerIncomingRequest(cwd, method, params)
          : conversation.answerIncoming(method, params),
    })
    if (started.isErr()) return Result.err(operationError(operation, started.error))

    const client = started.value
    const prepared = await prepareClient(client, operation)
    if (prepared.isErr()) {
      await client.stop()
      return prepared
    }
    const selected = await selectConversation(client)
    if (selected.isErr()) {
      await client.stop()
      return selected
    }

    if (replayError !== undefined) {
      await client.stop()
      return Result.err(operationError(operation, replayError, 'INVALID_PROVIDER_RESPONSE'))
    }
    const view = replay.snapshot(selected.value)
    if (view.isErr()) {
      await client.stop()
      return Result.err(operationError(operation, view.error, 'INVALID_PROVIDER_RESPONSE'))
    }

    conversation = new GrokConversation(selected.value, client, cwd, onEvent, view.value)
    return Result.ok({ conversation, view: view.value })
  }
}

/** Internal state for one ACP process owned by GrokAgent. */
class GrokConversation {
  private mapper: GrokEventMapper | undefined
  private activeTurnId: TurnId | undefined
  private closed = false
  private currentView: ConversationView
  private listener: (event: ConversationEvent) => void
  private readonly permissions = new Map<PermissionId, PendingPermission>()

  constructor(
    readonly conversationId: ConversationId,
    private readonly client: AcpProcess,
    private readonly cwd: string,
    onEvent: (event: ConversationEvent) => void,
    view: ConversationView,
  ) {
    this.currentView = ConversationViewSchema.parse(view)
    this.listener = onEvent
  }

  get view(): ConversationView {
    return ConversationViewSchema.parse(this.currentView)
  }

  /** What this conversation is doing now, which no stored file records. */
  get turn(): ConversationTurnState {
    return this.activeTurnId === undefined
      ? { state: 'idle' }
      : { state: 'running', turnId: this.activeTurnId }
  }

  setListener(listener: (event: ConversationEvent) => void): void {
    this.listener = listener
  }

  async startTurn(command: StartTurn): Promise<ResultType<void, CodingAgentError>> {
    if (this.closed) {
      return Result.err(operationError('start_turn', undefined, 'CONVERSATION_NOT_OPEN'))
    }
    if (this.activeTurnId !== undefined) {
      return Result.err(operationError('start_turn', undefined, 'CONVERSATION_BUSY'))
    }

    const mapper = new GrokEventMapper(this.conversationId, command.turnId, ids)
    const started = mapper.start(command.prompt)
    if (started.isErr()) {
      return Result.err(operationError('start_turn', started.error, 'INVALID_PROVIDER_RESPONSE'))
    }
    this.mapper = mapper
    this.activeTurnId = command.turnId
    const sent = this.send(started.value, 'start_turn')
    if (sent.isErr()) {
      this.mapper = undefined
      this.activeTurnId = undefined
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
    for (const pending of this.permissions.values()) {
      pending.resolve(Result.ok({ outcome: { outcome: 'cancelled' } }))
    }
    this.permissions.clear()
    await this.client.stop()
    return Result.ok()
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

    const permissionId = createPermissionId()
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
        prompt: [{ type: 'text', text: command.prompt }],
      },
      timeoutMs: 1_800_000,
    })
    if (response.isErr()) {
      if (!this.closed) this.failTurn(codingAgentUnavailable())
      return
    }
    const parsed = promptResponseSchema.safeParse(response.value)
    if (!parsed.success) {
      this.failTurn(invalidUpdate())
      return
    }
    const finished = mapper.finish(parsed.data.stopReason)
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
  }

  private failTurn(error: CanonicalCodingAgentError): void {
    const failed = this.mapper?.fail(error)
    if (failed?.isOk()) void this.send(failed.value, 'start_turn')
    this.activeTurnId = undefined
    this.mapper = undefined
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
    for (const event of events) this.listener(event)
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
    onRequest: (method) =>
      Promise.resolve(Result.err({ code: -32601, message: `method not found: ${method}` })),
  })
  if (started.isErr()) return Result.err(operationError('list', started.error))

  const prepared = await prepareClient(started.value, 'list')
  if (prepared.isErr()) {
    await started.value.stop()
    return Result.err(prepared.error)
  }
  return Result.ok(started.value)
}

async function prepareClient(
  client: AcpProcess,
  operation: 'open' | 'create' | 'list',
): Promise<ResultType<void, CodingAgentError>> {
  const initialized = await client.request({
    method: 'initialize',
    params: {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
    },
    timeoutMs: 30_000,
  })
  if (initialized.isErr()) return Result.err(operationError(operation, initialized.error))

  const authenticated = await client.request({
    method: 'authenticate',
    params: { methodId: 'cached_token', _meta: { headless: true } },
    timeoutMs: 30_000,
  })
  return authenticated.isErr()
    ? Result.err(operationError(operation, authenticated.error))
    : Result.ok()
}

function snapshot(summary: ConversationIdentity, view: ConversationView): ConversationSnapshot {
  return { summary, view }
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
