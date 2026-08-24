import type { DurableObjectResolver } from '@porte/core'
import type { HostRepository } from '@server/domain/host/host.repository.ts'
import type { SubAgentStub } from 'agents'

import type { Db } from '../persistence/database/types.ts'
import type { RelayDb } from '../persistence/relay/connection.ts'
import { DrizzleConversationRepository } from '../persistence/repositories/conversation.repository.ts'
import { DrizzleHostRepository } from '../persistence/repositories/host.repository.ts'
import type { ConversationAgent } from './conversation-agent.ts'
import { ConversationAgentClient } from './conversation-agent-client.ts'

/** Resources owned by one host relay Durable Object. */
export type HostRelayResources = {
  conversationRepository: DrizzleConversationRepository
  conversationAgents: ConversationAgentClient
  hostRepository: HostRepository
}

/** Construct resources from the relay database and child Agent resolver. */
export function createHostRelayResources(
  relayDb: RelayDb,
  applicationDb: () => Db,
  conversationAgents: DurableObjectResolver<SubAgentStub<ConversationAgent>>,
): HostRelayResources {
  return {
    conversationRepository: new DrizzleConversationRepository(relayDb),
    conversationAgents: new ConversationAgentClient(conversationAgents),
    hostRepository: new DrizzleHostRepository(applicationDb),
  }
}
