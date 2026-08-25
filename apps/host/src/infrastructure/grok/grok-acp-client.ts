import { PROTOCOL_VERSION, type AgentCapabilities } from '@agentclientprotocol/sdk'
import { CodingAgentResponseError } from '@host/application/errors/coding-agent-errors.ts'
import {
  startAcpClient,
  type AcpClient,
  type StartAcpClient,
} from '@host/infrastructure/acp/client.ts'
import { CodingAgentUnavailableError } from '@porte/core/client'

export type GrokAcpClient = Pick<AcpClient, 'request' | 'notify' | 'stop'>

export type StartGrokAcpClient = Omit<StartAcpClient, 'command' | 'args'>

/** Start one Grok ACP child process. */
export function startGrokAcpClient(input: StartGrokAcpClient): Promise<AcpClient> {
  return startAcpClient({
    ...input,
    command: 'grok',
    args: ['--no-auto-update', 'agent', 'stdio'],
  }).catch((cause: unknown) => {
    throw new CodingAgentUnavailableError({ cause })
  })
}

/** Initialize one Grok ACP client and return its capabilities. */
export async function initializeGrokAcpClient(client: GrokAcpClient): Promise<AgentCapabilities> {
  const initialized = await client
    .request({
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
    .catch((cause: unknown) => {
      throw new CodingAgentUnavailableError({ cause })
    })
  if (initialized.protocolVersion !== PROTOCOL_VERSION) {
    throw new CodingAgentResponseError({ cause: undefined })
  }

  const cachedToken = initialized.authMethods?.find(
    (method) => !('type' in method) && method.id === 'cached_token',
  )
  if (cachedToken !== undefined) {
    await client
      .request({
        method: 'authenticate',
        params: { methodId: cachedToken.id, _meta: { headless: true } },
        timeoutMs: 30_000,
      })
      .catch((cause: unknown) => {
        throw new CodingAgentUnavailableError({ cause })
      })
  }
  return initialized.agentCapabilities ?? {}
}
