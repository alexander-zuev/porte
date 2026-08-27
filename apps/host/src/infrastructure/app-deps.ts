import { type IMessageBus, MessageBus } from '@host/application/message-bus.ts'
import type { BackgroundTasks } from '@host/application/ports/background-tasks.ts'
import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { HostConnections } from '@host/application/ports/host-connections.ts'
import type { ConversationRepository } from '@host/domain/repositories/conversation-repository.ts'
import { createAgentInbound } from '@host/entrypoints/acp/acp-inbound.ts'
import { CONTROL_METHOD_HANDLERS } from '@host/entrypoints/websocket/control-method-handlers.ts'
import { CONVERSATION_METHOD_HANDLERS } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { HostConnectionManager } from '@host/entrypoints/websocket/host-connection-manager.ts'
import { AcpCodingAgent } from '@host/infrastructure/acp/acp-coding-agent.ts'
import { startGrok } from '@host/infrastructure/grok/grok-launch.ts'
import { NodeBackgroundTasks } from '@host/infrastructure/node/background-tasks.ts'
import { EventOutbox } from '@host/infrastructure/persistence/event-outbox.ts'
import { InMemoryConversationRepository } from '@host/infrastructure/persistence/in-memory-conversation-repository.ts'
import { createPartySocketTransport } from '@host/infrastructure/websocket/party-socket-transport.ts'

/** Everything a handler may touch. Handlers receive it whole and read what they need. */
export type AppDeps = {
  readonly outbox: EventOutbox
  readonly conversations: ConversationRepository
  readonly codingAgent: CodingAgent
  readonly connections: HostConnections
  readonly background: BackgroundTasks
  readonly bus: IMessageBus
  readonly now: () => Date
}

export type CreateAppDepsInput = {
  readonly credential: { readonly baseUrl: string; readonly token: string }
  readonly signal: AbortSignal
}

/**
 * Composition root for `porte up`. Starts Grok eagerly: a host that cannot run
 * its agent should fail here, not on the first turn.
 *
 * The bus, the sockets, and the agent all need `deps`, and `deps` needs them;
 * the getters resolve that after construction. Nothing reads them before `run`.
 */
export async function createAppDeps(input: CreateAppDepsInput): Promise<AppDeps> {
  const outbox = new EventOutbox()
  const deps: AppDeps = {
    outbox,
    conversations: new InMemoryConversationRepository(outbox),
    background: new NodeBackgroundTasks(),
    now: () => new Date(),
    get bus() {
      return bus
    },
    get connections() {
      return connections
    },
    get codingAgent() {
      return codingAgent
    },
  }
  const bus = new MessageBus(deps)
  const connections = new HostConnectionManager(
    {
      baseUrl: input.credential.baseUrl,
      token: input.credential.token,
      controlHandlers: CONTROL_METHOD_HANDLERS,
      conversationHandlers: CONVERSATION_METHOD_HANDLERS,
      bus,
    },
    createPartySocketTransport,
  )
  const codingAgent = await AcpCodingAgent.start(
    (callbacks) => startGrok(input.signal, callbacks),
    createAgentInbound(bus, deps.background),
  )
  return deps
}
