import {
  PROTOCOL_VERSION,
  type AgentCapabilities,
  type AgentNotificationMethod,
  type AgentNotificationParamsByMethod,
  type AgentRequestMethod,
  type AgentRequestParamsByMethod,
  type AgentRequestResponsesByMethod,
  type AuthMethod,
  type CancelNotification,
  type CloseSessionRequest,
  type CloseSessionResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
} from '@agentclientprotocol/sdk'
import {
  CodingAgentCapabilityError,
  CodingAgentResponseError,
} from '@host/application/errors/coding-agent-errors.ts'
import {
  REQUIRED_CODING_AGENT_CAPABILITIES,
  type RequiredCodingAgentCapability,
} from '@host/application/ports/coding-agent.ts'
import {
  startAcpClient,
  type AcpClient,
  type StartAcpClient,
} from '@host/infrastructure/acp/client.ts'
import { AcpProtocolVersionMismatchError } from '@host/infrastructure/acp/error.ts'
import { CodingAgentUnavailableError } from '@porte/core/client'

const GROK_CACHED_TOKEN_AUTH_METHOD_ID = 'cached_token'

export type StartGrokAcpClient = Omit<StartAcpClient, 'command' | 'args'>

/** Owns one initialized Grok ACP process and its typed operations. */
export class GrokAcpClient {
  private constructor(
    private readonly client: AcpClient,
    readonly capabilities: AgentCapabilities,
  ) {}

  /** Start and initialize one Grok ACP process. */
  static async start(input: StartGrokAcpClient): Promise<GrokAcpClient> {
    const client = await startAcpClient({
      ...input,
      command: 'grok',
      args: ['--no-auto-update', 'agent', 'stdio'],
    }).catch((cause: unknown) => {
      throw new CodingAgentUnavailableError({ cause })
    })

    try {
      const initialized = await request(client, {
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
      requireSupportedProtocol(initialized.protocolVersion)
      await authenticateGrok(client, initialized.authMethods)
      const capabilities = initialized.agentCapabilities ?? {}
      requireGrokCapabilities(capabilities)
      return new GrokAcpClient(client, capabilities)
    } catch (cause) {
      await client.stop()
      if (cause instanceof AcpProtocolVersionMismatchError) {
        throw new CodingAgentResponseError({ cause })
      }
      throw cause
    }
  }

  listSessions(params: ListSessionsRequest): Promise<ListSessionsResponse> {
    return request(this.client, {
      method: 'session/list',
      params,
      timeoutMs: 30_000,
    })
  }

  loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    return request(this.client, { method: 'session/load', params, timeoutMs: 30_000 })
  }

  newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    return request(this.client, { method: 'session/new', params, timeoutMs: 30_000 })
  }

  prompt(params: PromptRequest): Promise<PromptResponse> {
    return request(this.client, { method: 'session/prompt', params, timeoutMs: 1_800_000 })
  }

  cancelSession(params: CancelNotification): Promise<void> {
    return notify(this.client, { method: 'session/cancel', params })
  }

  setSessionConfigOption(
    params: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    return request(this.client, {
      method: 'session/set_config_option',
      params,
      timeoutMs: 30_000,
    })
  }

  closeSession(params: CloseSessionRequest): Promise<CloseSessionResponse> {
    return request(this.client, { method: 'session/close', params, timeoutMs: 30_000 })
  }

  close(): Promise<void> {
    return this.client.stop()
  }
}

function requireSupportedProtocol(received: number): void {
  if (received === PROTOCOL_VERSION) return
  throw new AcpProtocolVersionMismatchError({ expected: PROTOCOL_VERSION, received })
}

async function authenticateGrok(
  client: AcpClient,
  methods: readonly AuthMethod[] | null | undefined,
): Promise<void> {
  const cachedTokenAuthMethod = methods?.find(
    (method) => !('type' in method) && method.id === GROK_CACHED_TOKEN_AUTH_METHOD_ID,
  )
  if (cachedTokenAuthMethod === undefined) return
  await request(client, {
    method: 'authenticate',
    params: { methodId: cachedTokenAuthMethod.id, _meta: { headless: true } },
    timeoutMs: 30_000,
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

async function request<Method extends AgentRequestMethod>(
  client: AcpClient,
  input: {
    readonly method: Method
    readonly params: AgentRequestParamsByMethod[Method]
    readonly timeoutMs: number
  },
): Promise<AgentRequestResponsesByMethod[Method]> {
  try {
    return await client.request(input)
  } catch (cause) {
    throw new CodingAgentUnavailableError({ cause })
  }
}

async function notify<Method extends AgentNotificationMethod>(
  client: AcpClient,
  input: {
    readonly method: Method
    readonly params: AgentNotificationParamsByMethod[Method]
  },
): Promise<void> {
  try {
    await client.notify(input)
  } catch (cause) {
    throw new CodingAgentUnavailableError({ cause })
  }
}
