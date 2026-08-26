import { homedir } from 'node:os'

import {
  PROTOCOL_VERSION,
  type AgentCapabilities,
  type AgentRequestMethod,
  type AgentRequestParamsByMethod,
  type AgentRequestResponsesByMethod,
  type AuthMethod,
  type ListSessionsResponse,
  type LoadSessionResponse,
  type NewSessionResponse,
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
  type StartTurn,
} from '@host/application/ports/coding-agent.ts'
import { AcpProtocolVersionMismatchError } from '@host/infrastructure/acp/error.ts'
import { answerIncomingRequest } from '@host/infrastructure/acp/incoming-request.ts'
import type { AcpSessionNotification, JsonValue } from '@host/infrastructure/acp/message.ts'
import type { AcpRequestHandler } from '@host/infrastructure/acp/transport.ts'
import { AcpTransport } from '@host/infrastructure/acp/transport.ts'
import { findGitRoot, normaliseGitRoot } from '@host/infrastructure/grok/git-root.ts'
import {
  GrokReplayMapper,
  isGrokEventMappingError,
  type GrokEventMappingError,
} from '@host/infrastructure/grok/grok-event-mapper.ts'
import {
  CodingAgentUnavailableError,
  ConversationCursorSchema,
  ConversationIdSchema,
  ConversationNotFoundError,
  ConversationViewSchema,
  IsoDateTimeSchema,
  WorkspaceNotAllowedError,
  makeConversationState,
  makeConversationSummary,
  type ConversationCursor,
  type ConversationEvent,
  type ConversationId,
  type ConversationState,
  type ConversationSummary,
  type ConversationView,
  type ListConversationsResult,
  type TurnId,
} from '@porte/core/client'
import { z } from 'zod'

const REQUEST_TIMEOUT_MS = 30_000
const MAX_LIST_PAGES = 40
const GROK_CACHED_TOKEN_AUTH_METHOD_ID = 'cached_token'

const grokSessionSchema = z.object({
  sessionId: ConversationIdSchema,
  cwd: z.string().min(1),
  title: z.string().optional(),
  updatedAt: IsoDateTimeSchema,
  _meta: z
    .object({
      'x.ai/session': z
        .object({ facets: z.object({ gitRoot: z.string().min(1).optional() }) })
        .optional(),
    })
    .optional(),
})

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
 * Owns the child through `AcpTransport` and open conversations by id.
 * Conversations do not own the process.
 */
export class GrokCodingAgent implements CodingAgent {
  private acp: ReadyGrok | undefined
  private readonly conversations = new Map<ConversationId, GrokConversation>()

  constructor(private readonly signal: AbortSignal) {}

  /** List Grok conversations the process can open. */
  async listConversations(cursor?: ConversationCursor): Promise<ListConversationsResult> {
    const { transport } = await this.ensureAcp()
    const listed = await grokRequest(transport, {
      method: 'session/list',
      params: cursor === undefined ? {} : { cursor },
      timeoutMs: REQUEST_TIMEOUT_MS,
    })
    return toListResult(listed)
  }

  /** Create one Grok conversation in a git workspace. */
  async createConversation(cwd: string): Promise<ConversationSummary> {
    const gitRoot = findGitRoot(cwd)
    if (gitRoot === undefined) throw new WorkspaceNotAllowedError()

    const { transport, capabilities } = await this.ensureAcp()
    const response = await grokRequest(transport, {
      method: 'session/new',
      params: { cwd, mcpServers: [] },
      timeoutMs: REQUEST_TIMEOUT_MS,
    })
    const conversationId = ConversationIdSchema.parse(response.sessionId)
    this.conversations.set(
      conversationId,
      GrokConversation.fromNew(conversationId, transport, cwd, capabilities, response),
    )
    return makeConversationSummary({
      id: conversationId,
      cwd,
      gitRoot: normaliseGitRoot(gitRoot),
      title: '',
      updatedAt: IsoDateTimeSchema.parse(new Date().toISOString()),
    })
  }

  /** Load one Grok conversation onto this process. */
  async openConversation(conversationId: ConversationId): Promise<void> {
    if (this.conversations.has(conversationId)) return

    const listed = await this.findConversation(conversationId)
    const { transport, capabilities } = await this.ensureAcp()
    const conversation = GrokConversation.loading(
      conversationId,
      transport,
      listed.cwd,
      capabilities,
    )
    this.conversations.set(conversationId, conversation)
    try {
      const response = await grokRequest(transport, {
        method: 'session/load',
        params: { sessionId: conversationId, cwd: listed.cwd, mcpServers: [] },
        timeoutMs: REQUEST_TIMEOUT_MS,
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
    return this.requireConversation(conversationId).snapshot()
  }

  /** Subscribe to canonical events from one open conversation. */
  onEvent(conversationId: ConversationId, listener: (event: ConversationEvent) => void): void {
    this.requireConversation(conversationId).setListener(listener)
  }

  /** Start one turn on an open conversation. */
  async startTurn(conversationId: ConversationId, command: StartTurn): Promise<void> {
    this.requireConversation(conversationId).startTurn(command)
  }

  /** Cancel the in-flight turn on an open conversation. */
  cancelTurn(conversationId: ConversationId, turnId: TurnId): Promise<void> {
    return this.requireConversation(conversationId).cancelTurn(turnId)
  }

  /** Set one configuration option on an open conversation. */
  setConfiguration(conversationId: ConversationId, command: SetConfiguration): Promise<void> {
    return this.requireConversation(conversationId).setConfiguration(command)
  }

  /** Answer one permission request on an open conversation. */
  answerPermission(conversationId: ConversationId, command: AnswerPermission): Promise<void> {
    return this.requireConversation(conversationId).answerPermission(command)
  }

  /** Answer one elicitation request on an open conversation. */
  answerElicitation(conversationId: ConversationId, command: AnswerElicitation): Promise<void> {
    return this.requireConversation(conversationId).answerElicitation(command)
  }

  /** Drop one open conversation. Does not stop the process. */
  async closeConversation(conversationId: ConversationId): Promise<void> {
    const conversation = this.conversations.get(conversationId)
    this.conversations.delete(conversationId)
    await conversation?.close()
  }

  /** Drop every open conversation and stop the Grok process. */
  async closeAll(): Promise<void> {
    const ids = [...this.conversations.keys()]
    await Promise.all(ids.map((id) => this.closeConversation(id)))
    const acp = this.acp
    this.acp = undefined
    await acp?.transport.stop()
  }

  private async findConversation(conversationId: ConversationId): Promise<ConversationSummary> {
    let cursor: string | undefined
    for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- ACP gives each cursor in the prior page.
      const listed = await this.listConversations(
        cursor === undefined ? undefined : ConversationCursorSchema.parse(cursor),
      )
      const found = listed.conversations.find((row) => row.id === conversationId)
      if (found !== undefined) return found
      if (listed.next === undefined) break
      cursor = listed.next
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
      const initialized = await grokRequest(transport, {
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
        timeoutMs: REQUEST_TIMEOUT_MS,
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

  private requireConversation(conversationId: ConversationId): GrokConversation {
    const conversation = this.conversations.get(conversationId)
    if (conversation === undefined) throw new ConversationNotFoundError()
    return conversation
  }
}

/**
 * One open conversation on the shared Grok process.
 *
 * Holds view and, while `session/load` is in flight, the replay fold.
 * Does not spawn or stop the child.
 */
class GrokConversation {
  private view: ConversationView
  private replay: GrokReplayMapper | undefined
  private replayError: GrokEventMappingError | undefined
  private listener: (event: ConversationEvent) => void = () => undefined

  private constructor(
    readonly conversationId: ConversationId,
    private readonly transport: AcpTransport,
    readonly cwd: string,
    private readonly capabilities: AgentCapabilities,
    view: ConversationView,
    replay: GrokReplayMapper | undefined,
  ) {
    this.view = view
    this.replay = replay
  }

  static fromNew(
    conversationId: ConversationId,
    transport: AcpTransport,
    cwd: string,
    capabilities: AgentCapabilities,
    response: NewSessionResponse,
  ): GrokConversation {
    const replay = new GrokReplayMapper()
    replay.seedSession(response)
    return new GrokConversation(
      conversationId,
      transport,
      cwd,
      capabilities,
      replay.snapshot(conversationId),
      undefined,
    )
  }

  static loading(
    conversationId: ConversationId,
    transport: AcpTransport,
    cwd: string,
    capabilities: AgentCapabilities,
  ): GrokConversation {
    return new GrokConversation(
      conversationId,
      transport,
      cwd,
      capabilities,
      emptyView,
      new GrokReplayMapper(),
    )
  }

  finishLoad(response: LoadSessionResponse): void {
    if (this.replayError !== undefined)
      throw new CodingAgentResponseError({ cause: this.replayError })
    const replay = this.replay
    if (replay === undefined) return
    replay.seedSession(response)
    this.view = replay.snapshot(this.conversationId)
    this.replay = undefined
  }

  snapshot(): ConversationState {
    return makeConversationState(this.view, { state: 'idle' })
  }

  setListener(listener: (event: ConversationEvent) => void): void {
    this.listener = listener
  }

  startTurn(_command: StartTurn): void {
    unimplemented('startTurn')
  }

  cancelTurn(_turnId: TurnId): Promise<void> {
    return unimplemented('cancelTurn')
  }

  setConfiguration(_command: SetConfiguration): Promise<void> {
    return unimplemented('setConfiguration')
  }

  answerPermission(_command: AnswerPermission): Promise<void> {
    return unimplemented('answerPermission')
  }

  answerElicitation(_command: AnswerElicitation): Promise<void> {
    return unimplemented('answerElicitation')
  }

  async close(): Promise<void> {
    if (
      this.capabilities.sessionCapabilities?.close === undefined ||
      this.capabilities.sessionCapabilities.close === null
    ) {
      return
    }
    await grokRequest(this.transport, {
      method: 'session/close',
      params: { sessionId: this.conversationId },
      timeoutMs: REQUEST_TIMEOUT_MS,
    })
  }

  receiveUpdate(notification: AcpSessionNotification): void {
    const replay = this.replay
    if (replay === undefined) return
    if (this.replayError !== undefined) return
    try {
      replay.map(notification)
    } catch (cause) {
      if (isGrokEventMappingError(cause)) this.replayError = cause
      else throw cause
    }
  }

  answerIncoming(
    _id: Parameters<AcpRequestHandler>[0],
    method: string,
    params: JsonValue,
  ): Promise<JsonValue> {
    return answerIncomingRequest(this.cwd, method, params)
  }

  completeElicitation(_elicitationId: string): void {}
}

function toListResult(listed: ListSessionsResponse): ListConversationsResult {
  const conversations = listed.sessions.flatMap((session) => {
    const summary = toSummary(session)
    return summary === undefined ? [] : [summary]
  })
  const cursor = listed.nextCursor
  return cursor === undefined || cursor === null
    ? { conversations }
    : { conversations, next: ConversationCursorSchema.parse(cursor) }
}

function toSummary(session: SessionInfo): ConversationSummary | undefined {
  const parsed = grokSessionSchema.safeParse(session)
  if (!parsed.success) throw new CodingAgentResponseError({ cause: parsed.error })
  // oxlint-disable-next-line no-underscore-dangle -- ACP reserves `_meta` for provider data.
  const gitRoot = parsed.data._meta?.['x.ai/session']?.facets.gitRoot
  if (gitRoot === undefined) return undefined
  return makeConversationSummary({
    id: parsed.data.sessionId,
    cwd: parsed.data.cwd,
    gitRoot: normaliseGitRoot(gitRoot),
    title: parsed.data.title ?? '',
    updatedAt: parsed.data.updatedAt,
  })
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
  await grokRequest(transport, {
    method: 'authenticate',
    params: { methodId: cachedTokenAuthMethod.id, _meta: { headless: true } },
    timeoutMs: REQUEST_TIMEOUT_MS,
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

async function grokRequest<Method extends AgentRequestMethod>(
  transport: AcpTransport,
  input: {
    readonly method: Method
    readonly params: AgentRequestParamsByMethod[Method]
    readonly timeoutMs: number
  },
): Promise<AgentRequestResponsesByMethod[Method]> {
  try {
    return await transport.request(input)
  } catch (cause) {
    throw new CodingAgentUnavailableError({ cause })
  }
}

function unimplemented(operation: string): never {
  throw new TypeError(`${operation} is not implemented`)
}
