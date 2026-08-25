import { ConversationCatalog } from '@host/application/conversation-catalog.ts'
import { HostNotPairedError } from '@host/application/errors/pairing-errors.ts'
import { HostRuntime } from '@host/application/host-runtime.ts'
import { SessionSupervisor } from '@host/application/session-supervisor.ts'
import { CONTROL_METHOD_HANDLERS } from '@host/entrypoints/websocket/control-method-handlers.ts'
import { CONVERSATION_METHOD_HANDLERS } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { HostConnectionManager } from '@host/entrypoints/websocket/host-connection-manager.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'
import { GrokAcpSessionFactory } from '@host/infrastructure/grok/grok-acp-session-factory.ts'
import { FileConversationCreationStore } from '@host/infrastructure/persistence/conversation-creation-store.ts'
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

  const factory = new GrokAcpSessionFactory(signal)
  const sessions = new SessionSupervisor(factory)
  const catalog = new ConversationCatalog()
  const connections = new HostConnectionManager(
    {
      baseUrl: credential.baseUrl,
      controlHandlers: CONTROL_METHOD_HANDLERS,
      conversationHandlers: CONVERSATION_METHOD_HANDLERS,
      catalog,
      creations: new FileConversationCreationStore(config.dataDirectory),
      factory,
      sessions,
      token: credential.token,
    },
    createPartySocketTransport,
  )
  return new HostRuntime(signal, connections, sessions)
}
