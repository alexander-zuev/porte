/* oxlint-disable no-underscore-dangle -- ACP reserves `_meta` for provider data. */
import type { CreateElicitationResponse, McpServer, StopReason } from '@agentclientprotocol/sdk'
import type {
  AgentListener,
  CodingAgent,
  CreatedSession,
  CreateSession,
  LoadedSession,
  PermissionOutcome,
  PromptResult,
  SessionPage,
} from '@host/application/ports/coding-agent.ts'
import type { TurnOutcome } from '@host/domain/conversation/conversation.ts'
import { elicitationId, permissionId } from '@host/domain/conversation/message-identity.ts'
import type { AcpRequestHandler } from '@host/infrastructure/acp/acp-agent-process.ts'
import {
  modelsToConfiguration,
  parseSessionModels,
  toAcpContent,
  type AcpSessionModels,
} from '@host/infrastructure/acp/acp-content.ts'
import { AcpUpdateMapper } from '@host/infrastructure/acp/acp-update-mapper.ts'
import { AcpClientRequestError } from '@host/infrastructure/acp/error.ts'
import {
  answerIncomingRequest,
  parseElicitationRequest,
  parsePermissionRequest,
} from '@host/infrastructure/acp/incoming-request.ts'
import type { AcpSessionNotification, JsonValue } from '@host/infrastructure/acp/message.ts'
import type { AcpCallbacks, ReadyAgent } from '@host/infrastructure/grok/grok-launch.ts'
import {
  ConversationCursorSchema,
  ConversationIdSchema,
  ConversationNotFoundError,
  ElicitationIdSchema,
  type CanonicalContent,
  type ConversationCursor,
  type ConversationEvent,
  type ConversationId,
  type ElicitationAnswer,
  type ElicitationId,
  type PermissionId,
  type TurnId,
} from '@porte/core/client'
import { z } from 'zod'

/** A turn may run tools for a long time; the relay cancels, the host does not time out. */
const PROMPT_TIMEOUT_MS = 1_800_000

const sessionIdParamsSchema = z.object({ sessionId: ConversationIdSchema })

/** RAM for one session created, loaded, or resumed in this process. */
type OpenSession = {
  readonly cwd: string
  readonly mapper: AcpUpdateMapper
  models: AcpSessionModels | undefined
  contextTokens: number | undefined
  /** Set while `session/load` replays; mapped events collect here instead of the listener. */
  replay: ConversationEvent[] | undefined
}

type Parked = { readonly conversationId: ConversationId; readonly resolve: (v: JsonValue) => void }

/**
 * `CodingAgent` over one ACP process.
 *
 * Keeps only what ACP needs: the sessions this process opened (`cwd` for fs
 * requests, one mapper each) and the client requests parked until the relay
 * answers them. Turn state and transcripts belong to the `Conversation` aggregate.
 */
export class AcpCodingAgent implements CodingAgent {
  private readonly sessions = new Map<ConversationId, OpenSession>()
  private readonly parkedPermissions = new Map<PermissionId, Parked>()
  private readonly parkedElicitations = new Map<ElicitationId, Parked>()
  private readonly elicitationOwners = new Map<ElicitationId, ConversationId>()
  /** Updates for a session whose `session/new` response has not arrived yet. */
  private readonly orphans = new Map<string, AcpSessionNotification[]>()

  private constructor(
    private readonly agent: ReadyAgent,
    private readonly listener: AgentListener,
  ) {}

  /** Start the agent with this adapter's inbound callbacks wired in. */
  static async start(
    launch: (callbacks: AcpCallbacks) => Promise<ReadyAgent>,
    listener: AgentListener,
  ): Promise<AcpCodingAgent> {
    let adapter: AcpCodingAgent | undefined
    const ready = await launch({
      onUpdate: (notification) => adapter?.receiveUpdate(notification),
      onRequest: (id, method, params) => {
        if (adapter === undefined) {
          throw new AcpClientRequestError({ code: -32603, message: 'agent is starting' })
        }
        return adapter.answerRequest(id, method, params)
      },
      onElicitationComplete: ({ elicitationId: id }) => adapter?.completeElicitation(id),
    })
    adapter = new AcpCodingAgent(ready, listener)
    return adapter
  }

  async listSessions(cursor?: ConversationCursor): Promise<SessionPage> {
    const listed = await this.agent.process.request({
      method: 'session/list',
      params: cursor === undefined ? {} : { cursor },
    })
    const sessions = listed.sessions.flatMap((row) => {
      const facts = this.agent.sessionFacts(row)
      return facts === undefined ? [] : [facts]
    })
    return listed.nextCursor == null
      ? { sessions }
      : { sessions, next: ConversationCursorSchema.parse(listed.nextCursor) }
  }

  async createSession(input: CreateSession): Promise<CreatedSession> {
    const created = await this.agent.process.request({
      method: 'session/new',
      params: { cwd: input.cwd, mcpServers: toMcpServers(input.mcpServers) },
    })
    const id = ConversationIdSchema.parse(created.sessionId)
    const session = this.open(id, input.cwd, parseSessionModels(created))
    const events = [...this.configurationEvents(session), ...this.adoptOrphans(id)]
    return { id, events }
  }

  async loadSession(id: ConversationId, cwd: string): Promise<LoadedSession> {
    const session = this.open(id, cwd, undefined)
    session.replay = []
    try {
      const loaded = await this.agent.process.request({
        method: 'session/load',
        params: { sessionId: id, cwd, mcpServers: [] },
      })
      session.models = parseSessionModels(loaded)
      session.contextTokens = this.agent.contextTokens(session.models)
      return {
        title: this.agent.sessionTitle(loaded),
        events: [...session.replay, ...this.configurationEvents(session)],
      }
    } catch (cause) {
      this.sessions.delete(id)
      throw cause
    } finally {
      session.replay = undefined
    }
  }

  isOpen(id: ConversationId): boolean {
    return this.sessions.has(id)
  }

  async prompt(
    id: ConversationId,
    turnId: TurnId,
    promptIndex: number,
    content: readonly CanonicalContent[],
  ): Promise<PromptResult> {
    const session = this.requireSession(id)
    session.mapper.beginTurn(turnId, promptIndex)
    try {
      const response = await this.agent.process.request({
        method: 'session/prompt',
        params: { sessionId: id, prompt: content.map(toAcpContent) },
        timeoutMs: PROMPT_TIMEOUT_MS,
      })
      const usage = this.agent.promptUsage(response._meta, session.contextTokens)
      return usage === undefined
        ? { outcome: toOutcome(response.stopReason) }
        : { outcome: toOutcome(response.stopReason), usage }
    } finally {
      this.listener.onEvents(id, session.mapper.endTurn())
    }
  }

  async cancel(id: ConversationId): Promise<void> {
    this.requireSession(id)
    await this.agent.process.notify({ method: 'session/cancel', params: { sessionId: id } })
  }

  async setModel(id: ConversationId, modelId: string): Promise<readonly ConversationEvent[]> {
    const session = this.requireSession(id)
    await this.agent.process.request({
      method: 'session/set_model',
      params: { sessionId: id, modelId },
    })
    if (session.models === undefined) return []
    session.models = { ...session.models, currentModelId: modelId }
    session.contextTokens = this.agent.contextTokens(session.models)
    return this.configurationEvents(session)
  }

  async closeSession(id: ConversationId): Promise<void> {
    const session = this.sessions.get(id)
    if (session === undefined) return
    this.sessions.delete(id)
    this.orphans.delete(id)
    this.releaseParked(id)
    if (this.agent.capabilities.sessionCapabilities?.close == null) return
    await this.agent.process.request({ method: 'session/close', params: { sessionId: id } })
  }

  resolvePermission(id: PermissionId, outcome: PermissionOutcome): void {
    const parked = this.parkedPermissions.get(id)
    if (parked === undefined) return
    this.parkedPermissions.delete(id)
    parked.resolve(
      outcome.type === 'selected'
        ? { outcome: { outcome: 'selected', optionId: outcome.optionId } }
        : { outcome: { outcome: 'cancelled' } },
    )
  }

  resolveElicitation(id: ElicitationId, answer: ElicitationAnswer): void {
    const parked = this.parkedElicitations.get(id)
    if (parked === undefined) return
    this.parkedElicitations.delete(id)
    // A URL elicitation the user accepted finishes later with `elicitation/complete`.
    if (answer.type !== 'accept') this.elicitationOwners.delete(id)
    parked.resolve(elicitationResponse(answer))
  }

  async stop(): Promise<void> {
    for (const id of this.sessions.keys()) this.releaseParked(id)
    this.sessions.clear()
    await this.agent.process.stop()
  }

  private open(id: ConversationId, cwd: string, models: AcpSessionModels | undefined): OpenSession {
    const session: OpenSession = {
      cwd,
      mapper: new AcpUpdateMapper(id),
      models,
      contextTokens: this.agent.contextTokens(models),
      replay: undefined,
    }
    this.sessions.set(id, session)
    return session
  }

  private requireSession(id: ConversationId): OpenSession {
    const session = this.sessions.get(id)
    if (session === undefined) throw new ConversationNotFoundError()
    return session
  }

  private configurationEvents(session: OpenSession): ConversationEvent[] {
    if (session.models === undefined) return []
    return [
      {
        type: 'conversation.configuration.updated',
        options: [modelsToConfiguration(session.models)],
      },
    ]
  }

  private receiveUpdate(notification: AcpSessionNotification): void {
    const id = ConversationIdSchema.safeParse(notification.sessionId)
    if (!id.success) return
    const session = this.sessions.get(id.data)
    if (session === undefined) {
      // `session/new` answers after its first updates; keep them until the id is known.
      const pending = this.orphans.get(id.data) ?? []
      pending.push(notification)
      this.orphans.set(id.data, pending)
      return
    }
    const events = session.mapper.map(notification)
    if (session.replay !== undefined) session.replay.push(...events)
    else if (events.length > 0) this.listener.onEvents(id.data, events)
  }

  private adoptOrphans(id: ConversationId): ConversationEvent[] {
    const pending = this.orphans.get(id) ?? []
    this.orphans.delete(id)
    const session = this.requireSession(id)
    return pending.flatMap((notification) => session.mapper.map(notification))
  }

  private readonly answerRequest: AcpRequestHandler = async (requestId, method, params) => {
    const parsed = sessionIdParamsSchema.safeParse(params)
    const session = parsed.success ? this.sessions.get(parsed.data.sessionId) : undefined
    if (!parsed.success || session === undefined) {
      throw new AcpClientRequestError({ code: -32602, message: 'unknown session' })
    }
    // JSON-RPC allows a null id on notifications only; a request without one cannot be answered.
    if (requestId === null) {
      throw new AcpClientRequestError({ code: -32600, message: 'request has no id' })
    }
    const conversationId = parsed.data.sessionId
    if (method === 'session/request_permission') {
      return this.parkPermission(conversationId, session, requestId, params)
    }
    if (method === 'elicitation/create') {
      return this.parkElicitation(conversationId, session, requestId, params)
    }
    return answerIncomingRequest(session.cwd, method, params)
  }

  private parkPermission(
    conversationId: ConversationId,
    session: OpenSession,
    requestId: string | number,
    params: JsonValue,
  ): Promise<JsonValue> {
    const request = parsePermissionRequest(params)
    const turnId = session.mapper.liveTurnId
    if (turnId === undefined) {
      throw new AcpClientRequestError({ code: -32600, message: 'no active turn' })
    }
    const id = permissionId(turnId, requestId)
    const parked = new Promise<JsonValue>((resolve) => {
      this.parkedPermissions.set(id, { conversationId, resolve })
    })
    this.listener.onPermissionRequest(conversationId, {
      permissionId: id,
      toolCallId: request.toolCall.toolCallId,
      title: request.toolCall.title ?? '',
      options: request.options,
    })
    return parked
  }

  private parkElicitation(
    conversationId: ConversationId,
    session: OpenSession,
    requestId: string | number,
    params: JsonValue,
  ): Promise<JsonValue> {
    const request = parseElicitationRequest(params)
    const turnId = session.mapper.liveTurnId
    if (turnId === undefined) {
      throw new AcpClientRequestError({ code: -32600, message: 'no active turn' })
    }
    const id =
      request.elicitationId === undefined
        ? elicitationId(turnId, requestId)
        : ElicitationIdSchema.parse(request.elicitationId)
    const parked = new Promise<JsonValue>((resolve) => {
      this.parkedElicitations.set(id, { conversationId, resolve })
    })
    this.elicitationOwners.set(id, conversationId)
    this.listener.onElicitationRequest(conversationId, {
      elicitationId: id,
      request: request.request,
    })
    return parked
  }

  private completeElicitation(raw: string): void {
    const id = ElicitationIdSchema.safeParse(raw)
    if (!id.success) return
    const owner = this.elicitationOwners.get(id.data)
    if (owner === undefined) return
    this.elicitationOwners.delete(id.data)
    this.listener.onElicitationComplete(owner, id.data)
  }

  /** Answer every parked request of one session as cancelled so the agent can move on. */
  private releaseParked(conversationId: ConversationId): void {
    for (const [id, parked] of this.parkedPermissions) {
      if (parked.conversationId !== conversationId) continue
      this.parkedPermissions.delete(id)
      parked.resolve({ outcome: { outcome: 'cancelled' } })
    }
    for (const [id, parked] of this.parkedElicitations) {
      if (parked.conversationId !== conversationId) continue
      this.parkedElicitations.delete(id)
      this.elicitationOwners.delete(id)
      parked.resolve({ action: 'cancel' })
    }
  }
}

function toOutcome(stopReason: StopReason): TurnOutcome {
  switch (stopReason) {
    case 'end_turn':
      return { type: 'completed', reason: 'completed' }
    case 'refusal':
      return { type: 'completed', reason: 'refused' }
    case 'max_tokens':
    case 'max_turn_requests':
      return { type: 'completed', reason: 'limit_reached' }
    case 'cancelled':
      return { type: 'cancelled' }
  }
}

function elicitationResponse(answer: ElicitationAnswer): JsonValue {
  if (answer.type === 'submit') {
    return { action: 'accept', content: answer.values } satisfies CreateElicitationResponse
  }
  if (answer.type === 'accept') return { action: 'accept' } satisfies CreateElicitationResponse
  return { action: answer.type } satisfies CreateElicitationResponse
}

function toMcpServers(servers: CreateSession['mcpServers']): McpServer[] {
  if (servers === undefined) return []
  // SAFETY: `conversation.create` carries MCP JSON as-is until core owns a schema; ACP rejects a bad list.
  return [...servers] as McpServer[]
}
