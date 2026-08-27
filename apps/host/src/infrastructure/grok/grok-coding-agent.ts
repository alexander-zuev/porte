import { homedir } from 'node:os'

import {
  PROTOCOL_VERSION,
  type AgentCapabilities,
  type AuthMethod,
  type ContentBlock,
  type CreateElicitationResponse,
  type ListSessionsResponse,
  type LoadSessionResponse,
  type McpServer,
  type SessionInfo,
} from '@agentclientprotocol/sdk'
import {
  CodingAgentCapabilityError,
  CodingAgentResponseError,
} from '@host/application/errors/coding-agent-errors.ts'
import {
  REQUIRED_CODING_AGENT_CAPABILITIES,
  type AnswerElicitation,
  type AnswerPermission,
  type CodingAgent,
  type RequiredCodingAgentCapability,
  type SetConfiguration,
  type CreatedSession,
  type CreateConversation,
  type StartTurn,
} from '@host/application/ports/coding-agent.ts'
import { applyConversationEvents } from '@host/domain/conversation/conversation-view-reducer.ts'
import { Conversation } from '@host/domain/conversation/conversation.ts'
import { AcpClientRequestError } from '@host/infrastructure/acp/error.ts'
import { AcpProtocolVersionMismatchError } from '@host/infrastructure/acp/error.ts'
import {
  answerIncomingRequest,
  parseElicitationRequest,
  parsePermissionRequest,
} from '@host/infrastructure/acp/incoming-request.ts'
import type { AcpSessionNotification, JsonValue } from '@host/infrastructure/acp/message.ts'
import type { AcpRequestHandler } from '@host/infrastructure/acp/transport.ts'
import { AcpTransport } from '@host/infrastructure/acp/transport.ts'
import {
  GrokEventMapper,
  GrokReplayMapper,
  isGrokEventMappingError,
  mapGrokConfiguration,
  type GrokEventMappingError,
} from '@host/infrastructure/grok/grok-event-mapper.ts'
import {
  CodingAgentUnavailableError,
  ConversationBusyError,
  ConversationCursorSchema,
  ConversationIdSchema,
  ConversationNotFoundError,
  ConversationViewSchema,
  ElicitationIdSchema,
  ElicitationNotFoundError,
  PermissionIdSchema,
  PermissionNotFoundError,
  makeConversationState,
  type CanonicalContent,
  type ConversationCursor,
  type ConversationEvent,
  type ConversationFailurePayload,
  type ConversationId,
  type ConversationState,
  type ConversationTurnState,
  type ConversationView,
  type ElicitationId,
  type PermissionId,
  type TurnId,
} from '@porte/core/client'
import { z } from 'zod'

const PROMPT_TIMEOUT_MS = 1_800_000
const MAX_LIST_PAGES = 40
const GROK_CACHED_TOKEN_AUTH_METHOD_ID = 'cached_token'

const sessionIdParamsSchema = z.object({ sessionId: ConversationIdSchema })

const emptyView = ConversationViewSchema.parse({
  items: [],
  tools: [],
  plans: [],
  pending: { permissions: [], elicitations: [] },
})

type ReadyGrok = {
  readonly transport: AcpTransport
  readonly capabilities: AgentCapabilities
}

/**
 * One Grok ACP process that implements Porte `CodingAgent`.
 *
 * Owns the child through `AcpTransport` and per-open-chat RAM by id.
 * Open conversations do not own the process or its capabilities.
 */
export class GrokCodingAgent implements CodingAgent {
  private acp: ReadyGrok | undefined
  private readonly held = new Map<ConversationId, Conversation>()
  private readonly conversations = new Map<ConversationId, OpenConversation>()

  constructor(private readonly signal: AbortSignal) {}

  /** List Grok conversations the process can open. */
  async listConversations(cursor?: ConversationCursor): Promise<ListSessionsResponse> {
    const { transport } = await this.ensureAcp()
    return transport.request({
      method: 'session/list',
      params: cursor === undefined ? {} : { cursor },
    })
  }

  /** Create one ACP session. */
  async createSession(command: CreateConversation): Promise<CreatedSession> {
    const { transport } = await this.ensureAcp()
    const session = await transport.request({
      method: 'session/new',
      params: { cwd: command.cwd, mcpServers: toMcpServers(command.mcpServers) },
    })
    return { id: ConversationIdSchema.parse(session.sessionId) }
  }

  /** Hold one conversation in RAM on this process. */
  hold(conversation: Conversation): void {
    this.held.set(conversation.id, conversation)
  }

  /** Load one Grok conversation onto this process. */
  async openConversation(conversationId: ConversationId): Promise<void> {
    if (this.held.has(conversationId) || this.conversations.has(conversationId)) return

    const listed = await this.findConversation(conversationId)
    const { transport } = await this.ensureAcp()
    const conversation = OpenConversation.loading(conversationId, listed.cwd)
    this.conversations.set(conversationId, conversation)
    try {
      const response = await transport.request({
        method: 'session/load',
        params: { sessionId: conversationId, cwd: listed.cwd, mcpServers: [] },
      })
      conversation.finishLoad(response)
    } catch (cause) {
      this.conversations.delete(conversationId)
      if (isGrokEventMappingError(cause)) throw new CodingAgentResponseError({ cause })
      throw cause
    }
  }

  /** Current view and turn of one open conversation. */
  snapshot(conversationId: ConversationId): ConversationState {
    const session = this.conversations.get(conversationId)
    if (session !== undefined) return session.snapshot()
    const conversation = this.held.get(conversationId)
    if (conversation === undefined) throw new ConversationNotFoundError()
    return makeConversationState(emptyView, { state: 'idle' })
  }

  /** Subscribe to canonical events from one open conversation. */
  onEvent(conversationId: ConversationId, listener: (event: ConversationEvent) => void): void {
    this.requireSession(conversationId).setListener(listener)
  }

  /** Start one turn on an open conversation. */
  async startTurn(conversationId: ConversationId, command: StartTurn): Promise<void> {
    const conversation = this.requireSession(conversationId)
    if (!conversation.beginTurn(command)) return
    void this.promptSession(conversation, command).finally(() => {
      conversation.clearTurn(command.turnId)
    })
  }

  /** Cancel the in-flight turn on an open conversation. */
  async cancelTurn(conversationId: ConversationId, turnId: TurnId): Promise<void> {
    const conversation = this.requireSession(conversationId)
    if (!conversation.isTurn(turnId)) throw new ConversationNotFoundError()
    const { transport } = await this.ensureAcp()
    await transport.notify({
      method: 'session/cancel',
      params: { sessionId: conversationId },
    })
    conversation.cancelPendingForTurn(turnId)
  }

  /** Set one configuration option on an open conversation. */
  async setConfiguration(conversationId: ConversationId, command: SetConfiguration): Promise<void> {
    const conversation = this.requireSession(conversationId)
    const { transport } = await this.ensureAcp()
    const params =
      command.value.type === 'boolean'
        ? {
            sessionId: conversationId,
            configId: command.optionId,
            type: 'boolean' as const,
            value: command.value.value,
          }
        : {
            sessionId: conversationId,
            configId: command.optionId,
            value: command.value.value,
          }
    const updated = await transport.request({
      method: 'session/set_config_option',
      params,
    })
    conversation.applyConfiguration(updated.configOptions)
  }

  /** Answer one permission request on an open conversation. */
  async answerPermission(conversationId: ConversationId, command: AnswerPermission): Promise<void> {
    await this.requireSession(conversationId).answerPermission(command)
  }

  /** Answer one elicitation request on an open conversation. */
  async answerElicitation(
    conversationId: ConversationId,
    command: AnswerElicitation,
  ): Promise<void> {
    await this.requireSession(conversationId).answerElicitation(command)
  }

  /** Drop one open conversation. Does not stop the process. */
  async closeConversation(conversationId: ConversationId): Promise<void> {
    this.held.delete(conversationId)
    const session = this.conversations.get(conversationId)
    this.conversations.delete(conversationId)
    const acp = this.acp
    if (session !== undefined) {
      if (acp !== undefined && session.hasActiveTurn()) {
        await acp.transport.notify({
          method: 'session/cancel',
          params: { sessionId: conversationId },
        })
      }
      session.discardPending()
    }
    if (acp === undefined) return
    if (acp.capabilities.sessionCapabilities?.close == null) return
    await acp.transport.request({
      method: 'session/close',
      params: { sessionId: conversationId },
    })
  }

  /** Drop every open conversation and stop the Grok process. */
  async closeAll(): Promise<void> {
    const ids = new Set([...this.held.keys(), ...this.conversations.keys()])
    await Promise.all([...ids].map((id) => this.closeConversation(id)))
    const acp = this.acp
    this.acp = undefined
    await acp?.transport.stop()
  }

  private async findConversation(conversationId: ConversationId): Promise<SessionInfo> {
    let cursor: string | undefined
    for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- ACP gives each cursor in the prior page.
      const listed = await this.listConversations(
        cursor === undefined ? undefined : ConversationCursorSchema.parse(cursor),
      )
      const found = listed.sessions.find((session) => session.sessionId === conversationId)
      if (found !== undefined) return found
      if (listed.nextCursor == null) break
      cursor = listed.nextCursor
    }
    throw new ConversationNotFoundError()
  }

  private async ensureAcp(): Promise<ReadyGrok> {
    if (this.acp !== undefined) return this.acp
    const acp = await this.startGrok()
    this.acp ??= acp
    if (this.acp !== acp) await acp.transport.stop()
    return this.acp
  }

  private async startGrok(): Promise<ReadyGrok> {
    const transport = await AcpTransport.start({
      command: 'grok',
      args: ['--no-auto-update', 'agent', 'stdio'],
      cwd: homedir(),
      signal: this.signal,
      onUpdate: (notification) => {
        this.receiveUpdate(notification)
      },
      onRequest: this.answerIncoming,
      onElicitationComplete: ({ elicitationId }) => {
        for (const conversation of this.conversations.values()) {
          conversation.completeElicitation(elicitationId)
        }
      },
    }).catch((cause: unknown) => {
      throw new CodingAgentUnavailableError({ cause })
    })

    try {
      const initialized = await transport.request({
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
      })
      requireSupportedProtocol(initialized.protocolVersion)
      await authenticateGrok(transport, initialized.authMethods)
      const capabilities = initialized.agentCapabilities ?? {}
      requireGrokCapabilities(capabilities)
      return { transport, capabilities }
    } catch (cause) {
      await transport.stop()
      if (cause instanceof AcpProtocolVersionMismatchError) {
        throw new CodingAgentResponseError({ cause })
      }
      throw cause
    }
  }

  private receiveUpdate(notification: AcpSessionNotification): void {
    const conversationId = ConversationIdSchema.safeParse(notification.sessionId)
    if (!conversationId.success) return
    this.conversations.get(conversationId.data)?.receiveUpdate(notification)
  }

  private answerIncoming: AcpRequestHandler = async (id, method, params) => {
    const conversationId = sessionIdFromParams(params)
    if (conversationId !== undefined) {
      const conversation = this.conversations.get(conversationId)
      if (conversation !== undefined) return conversation.answerIncoming(id, method, params)
    }
    return answerIncomingRequest(homedir(), method, params)
  }

  private requireSession(conversationId: ConversationId): OpenConversation {
    const existing = this.conversations.get(conversationId)
    if (existing !== undefined) return existing
    const held = this.held.get(conversationId)
    if (held === undefined) throw new ConversationNotFoundError()
    const session = OpenConversation.attach(held)
    this.conversations.set(conversationId, session)
    return session
  }

  private async promptSession(conversation: OpenConversation, command: StartTurn): Promise<void> {
    const { transport } = await this.ensureAcp()
    let response
    try {
      response = await transport.request({
        method: 'session/prompt',
        params: {
          sessionId: conversation.conversationId,
          prompt: command.userMessage.content.map(toAcpContent),
        },
        timeoutMs: PROMPT_TIMEOUT_MS,
      })
    } catch {
      conversation.failTurn(codingAgentUnavailable())
      return
    }
    conversation.finishTurn(command.turnId, response.stopReason)
  }
}

type PendingPermission = {
  readonly turnId: TurnId
  readonly optionIds: ReadonlySet<string>
  readonly resolve: (result: JsonValue) => void
}
type PendingElicitation = {
  readonly turnId: TurnId
  readonly resolve: (result: JsonValue) => void
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

/**
 * RAM for one chat loaded on this process.
 *
 * Folds the view, the in-flight turn, and parked permission/elicitation RPCs.
 */
class OpenConversation {
  private view: ConversationView
  private replay: GrokReplayMapper | undefined
  private replayError: GrokEventMappingError | undefined
  private mapper: GrokEventMapper | undefined
  private turnId: TurnId | undefined
  private listener: (event: ConversationEvent) => void = () => undefined
  private readonly permissions = new Map<PermissionId, PendingPermission>()
  private readonly elicitations = new Map<ElicitationId, PendingElicitation>()
  private readonly urlCompletions = new Map<ElicitationId, TurnId>()

  private constructor(
    readonly conversationId: ConversationId,
    readonly cwd: string,
    view: ConversationView,
    replay: GrokReplayMapper | undefined,
  ) {
    this.view = view
    this.replay = replay
  }

  static attach(conversation: Conversation): OpenConversation {
    return new OpenConversation(conversation.id, conversation.cwd, emptyView, undefined)
  }

  static loading(conversationId: ConversationId, cwd: string): OpenConversation {
    return new OpenConversation(conversationId, cwd, emptyView, new GrokReplayMapper())
  }

  finishLoad(response: LoadSessionResponse): void {
    if (this.replayError !== undefined) {
      throw new CodingAgentResponseError({ cause: this.replayError })
    }
    const replay = this.replay
    if (replay === undefined) return
    replay.seedSession(response)
    this.view = replay.snapshot(this.conversationId)
    this.replay = undefined
  }

  snapshot(): ConversationState {
    return makeConversationState(this.view, this.turn)
  }

  setListener(listener: (event: ConversationEvent) => void): void {
    this.listener = listener
  }

  isTurn(turnId: TurnId): boolean {
    return this.turnId === turnId && this.mapper !== undefined
  }

  hasActiveTurn(): boolean {
    return this.turnId !== undefined
  }

  beginTurn(command: StartTurn): boolean {
    if (this.turnId === command.turnId) return false
    if (this.turnId !== undefined) throw new ConversationBusyError()

    const mapper = new GrokEventMapper(this.conversationId, command.turnId)
    const started = mapper.start(command.userMessage)
    this.mapper = mapper
    this.turnId = command.turnId
    this.send(started)
    return true
  }

  clearTurn(turnId: TurnId): void {
    if (this.turnId !== turnId) return
    this.turnId = undefined
    this.mapper = undefined
  }

  cancelPendingForTurn(turnId: TurnId): void {
    const mapper = this.mapper
    if (this.turnId !== turnId || mapper === undefined) {
      throw new ConversationNotFoundError()
    }
    for (const [permissionId, pending] of this.permissions) {
      if (pending.turnId !== turnId) continue
      let mapped: readonly ConversationEvent[]
      try {
        mapped = mapper.permissionCancelled(permissionId)
      } catch (cause) {
        throw new CodingAgentResponseError({ cause })
      }
      this.send(mapped)
      this.permissions.delete(permissionId)
      pending.resolve({ outcome: { outcome: 'cancelled' } })
    }
    for (const [elicitationId, pending] of this.elicitations) {
      if (pending.turnId !== turnId) continue
      this.send([
        {
          type: 'elicitation.resolved',
          turnId,
          elicitationId,
          outcome: { type: 'cancelled' },
        },
      ])
      this.elicitations.delete(elicitationId)
      pending.resolve({ action: 'cancel' })
    }
  }

  applyConfiguration(configOptions: Parameters<typeof mapGrokConfiguration>[0]): void {
    this.send([
      {
        type: 'conversation.configuration.updated',
        options: mapGrokConfiguration(configOptions),
      },
    ])
  }

  finishTurn(turnId: TurnId, stopReason: Parameters<GrokEventMapper['finish']>[0]): void {
    if (this.turnId !== turnId) return
    const mapper = this.mapper
    if (mapper === undefined) return
    try {
      this.send(mapper.finish(stopReason))
    } catch {
      this.failTurn(invalidUpdate())
    }
  }

  failTurn(error: ConversationFailurePayload): void {
    try {
      const failed = this.mapper?.fail(error)
      if (failed !== undefined) this.send(failed)
    } catch {
      // Turn already failed.
    }
  }

  async answerPermission(command: AnswerPermission): Promise<void> {
    const pending = this.permissions.get(command.permissionId)
    if (
      pending === undefined ||
      pending.turnId !== command.turnId ||
      !pending.optionIds.has(command.optionId)
    ) {
      throw new PermissionNotFoundError()
    }
    const mapper = this.mapper
    if (mapper === undefined) throw new ConversationNotFoundError()
    let mapped: readonly ConversationEvent[]
    try {
      mapped = mapper.permissionResolved(command.permissionId, command.optionId)
    } catch (cause) {
      throw new CodingAgentResponseError({ cause })
    }
    this.send(mapped)
    this.permissions.delete(command.permissionId)
    pending.resolve({ outcome: { outcome: 'selected', optionId: command.optionId } })
  }

  async answerElicitation(command: AnswerElicitation): Promise<void> {
    const pending = this.elicitations.get(command.elicitationId)
    if (pending === undefined || pending.turnId !== command.turnId) {
      throw new ElicitationNotFoundError()
    }
    this.send([
      {
        type: 'elicitation.resolved',
        turnId: command.turnId,
        elicitationId: command.elicitationId,
        outcome: elicitationOutcome(command.answer),
      },
    ])
    this.elicitations.delete(command.elicitationId)
    if (command.answer.type === 'accept') {
      this.urlCompletions.set(command.elicitationId, command.turnId)
    }
    pending.resolve(elicitationResponse(command.answer))
  }

  discardPending(): void {
    for (const pending of this.permissions.values()) {
      pending.resolve({ outcome: { outcome: 'cancelled' } })
    }
    this.permissions.clear()
    for (const pending of this.elicitations.values()) {
      pending.resolve({ action: 'cancel' })
    }
    this.elicitations.clear()
    this.urlCompletions.clear()
  }

  receiveUpdate(notification: AcpSessionNotification): void {
    if (this.replay !== undefined) {
      if (this.replayError !== undefined) return
      try {
        this.replay.map(notification)
      } catch (cause) {
        if (isGrokEventMappingError(cause)) this.replayError = cause
        else throw cause
      }
      return
    }
    if (this.mapper === undefined) {
      this.applyIdleUpdate(notification)
      return
    }
    try {
      const mapped = this.mapper.map(notification)
      this.send(mapped)
    } catch {
      this.failTurn(invalidUpdate())
    }
  }

  answerIncoming(
    requestId: Parameters<AcpRequestHandler>[0],
    method: string,
    params: JsonValue,
  ): Promise<JsonValue> {
    if (method === 'elicitation/create') {
      return this.answerIncomingElicitation(requestId, params)
    }
    if (method !== 'session/request_permission') {
      return answerIncomingRequest(this.cwd, method, params)
    }
    const parsed = parsePermissionRequest(params)
    if (this.mapper === undefined || this.turnId === undefined) {
      throw new AcpClientRequestError({ code: -32600, message: 'no active turn' })
    }
    const permissionId = PermissionIdSchema.parse(`${this.turnId}:permission:${String(requestId)}`)
    try {
      const mapped = this.mapper.permissionRequested({
        permissionId,
        toolCallId: parsed.toolCall.toolCallId,
        title: parsed.toolCall.title ?? '',
        options: parsed.options,
      })
      this.send(mapped)
    } catch (cause) {
      throw new AcpClientRequestError({
        code: -32603,
        message: cause instanceof Error ? cause.message : 'internal error',
      })
    }
    const turnId = this.turnId
    return new Promise((resolve) => {
      this.permissions.set(permissionId, {
        turnId,
        optionIds: new Set(parsed.options.map((option) => option.optionId)),
        resolve,
      })
    })
  }

  completeElicitation(elicitationId: string): void {
    const parsed = ElicitationIdSchema.safeParse(elicitationId)
    if (!parsed.success) return
    const turnId = this.urlCompletions.get(parsed.data)
    if (turnId === undefined) return
    this.urlCompletions.delete(parsed.data)
    try {
      this.send([{ type: 'elicitation.completed', turnId, elicitationId: parsed.data }])
    } catch {
      this.failTurn(invalidUpdate())
    }
  }

  private applyIdleUpdate(notification: AcpSessionNotification): void {
    const update = notification.update
    if (update.sessionUpdate === 'config_option_update') {
      this.send([
        {
          type: 'conversation.configuration.updated',
          options: mapGrokConfiguration(update.configOptions),
        },
      ])
    }
  }

  private get turn(): ConversationTurnState {
    return this.turnId === undefined ? { state: 'idle' } : { state: 'running', turnId: this.turnId }
  }

  private answerIncomingElicitation(
    requestId: Parameters<AcpRequestHandler>[0],
    params: JsonValue,
  ): Promise<JsonValue> {
    const parsed = parseElicitationRequest(params)
    if (
      parsed.sessionId !== this.conversationId ||
      this.mapper === undefined ||
      this.turnId === undefined
    ) {
      throw new AcpClientRequestError({ code: -32600, message: 'no active turn' })
    }
    const elicitationId = ElicitationIdSchema.parse(
      parsed.elicitationId ?? `${this.turnId}:elicitation:${String(requestId)}`,
    )
    try {
      this.send([
        {
          type: 'elicitation.requested',
          turnId: this.turnId,
          elicitationId,
          request: parsed.request,
        },
      ])
    } catch (cause) {
      throw new AcpClientRequestError({
        code: -32603,
        message: cause instanceof Error ? cause.message : 'internal error',
      })
    }
    const turnId = this.turnId
    return new Promise((resolve) => {
      this.elicitations.set(elicitationId, { turnId, resolve })
    })
  }

  private send(events: readonly ConversationEvent[]): void {
    try {
      this.view = applyConversationEvents(this.view, events)
    } catch (cause) {
      throw new CodingAgentResponseError({ cause })
    }
    for (const event of events) this.listener(event)
  }
}

function toMcpServers(servers: readonly unknown[] | undefined): McpServer[] {
  if (servers === undefined) return []
  // SAFETY: conversation.create JSON is untyped until we own an MCP server schema. ACP session/new rejects a bad list.
  return [...servers] as McpServer[]
}

function sessionIdFromParams(params: JsonValue): ConversationId | undefined {
  const parsed = sessionIdParamsSchema.safeParse(params)
  return parsed.success ? parsed.data.sessionId : undefined
}

function requireSupportedProtocol(received: number): void {
  if (received === PROTOCOL_VERSION) return
  throw new AcpProtocolVersionMismatchError({ expected: PROTOCOL_VERSION, received })
}

async function authenticateGrok(
  transport: AcpTransport,
  methods: readonly AuthMethod[] | null | undefined,
): Promise<void> {
  const cachedTokenAuthMethod = methods?.find(
    (method) => !('type' in method) && method.id === GROK_CACHED_TOKEN_AUTH_METHOD_ID,
  )
  if (cachedTokenAuthMethod === undefined) return
  await transport.request({
    method: 'authenticate',
    params: { methodId: cachedTokenAuthMethod.id, _meta: { headless: true } },
  })
}

const grokCapabilityMap = {
  'conversation.list': {
    acp: 'sessionCapabilities.list',
    supports: (capabilities: AgentCapabilities) => capabilities.sessionCapabilities?.list != null,
  },
  'conversation.open': {
    acp: 'loadSession',
    supports: (capabilities: AgentCapabilities) => capabilities.loadSession === true,
  },
} satisfies Record<
  RequiredCodingAgentCapability,
  Readonly<{
    readonly acp: string
    readonly supports: (capabilities: AgentCapabilities) => boolean
  }>
>

function requireGrokCapabilities(capabilities: AgentCapabilities): void {
  for (const capability of REQUIRED_CODING_AGENT_CAPABILITIES) {
    const mapped = grokCapabilityMap[capability]
    if (mapped.supports(capabilities)) continue
    throw new CodingAgentCapabilityError({
      capability,
      cause: new TypeError(`Grok does not advertise ACP ${mapped.acp}`),
    })
  }
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
  return { type: 'resource', resource: embedded }
}

function codingAgentUnavailable(): ConversationFailurePayload {
  return {
    _tag: 'CodingAgentUnavailableError',
    message: 'Grok stopped before the turn completed.',
  }
}

function invalidUpdate(): ConversationFailurePayload {
  return {
    _tag: 'InternalServerError',
    message: 'Grok returned an invalid conversation update.',
  }
}
