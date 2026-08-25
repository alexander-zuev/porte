import { HostNotPairedError } from '@host/application/errors/pairing-errors.ts'
import { HostRuntime } from '@host/application/host-runtime.ts'
import { SessionSupervisor } from '@host/application/session-supervisor.ts'
import { CONTROL_METHOD_HANDLERS } from '@host/entrypoints/websocket/control-method-handlers.ts'
import { CONVERSATION_METHOD_HANDLERS } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { HostConnectionManager } from '@host/entrypoints/websocket/host-connection-manager.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'
import { GrokCodingAgent } from '@host/infrastructure/grok/grok-coding-agent.ts'
import { FileCredentialStore } from '@host/infrastructure/persistence/credential-store.ts'
import { createPartySocketTransport } from '@host/infrastructure/websocket/party-socket-transport.ts'

/** Create one inactive Host runtime from concrete adapters. */
export async function createHostRuntime(
  config: HostConfig,
  signal: AbortSignal,
): Promise<HostRuntime> {
  const credentials = new FileCredentialStore(config.dataDirectory)
  const credential = await credentials.read()
  if (credential === null) throw new HostNotPairedError()

  const codingAgent = new GrokCodingAgent(signal)
  const sessions = new SessionSupervisor(codingAgent)
  const connections = new HostConnectionManager(
    {
      baseUrl: credential.baseUrl,
      controlHandlers: CONTROL_METHOD_HANDLERS,
      conversationHandlers: CONVERSATION_METHOD_HANDLERS,
      codingAgent,
      sessions,
      token: credential.token,
    },
    createPartySocketTransport,
  )
  return new HostRuntime(signal, connections, sessions)
}
