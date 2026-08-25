import type { HostRepository } from '@server/domain/host/host.repository.ts'

import type { Db } from '../persistence/database/types.ts'
import type { RelayDb } from '../persistence/relay/connection.ts'
import { DrizzleConversationRepository } from '../persistence/repositories/conversation.repository.ts'
import { DrizzleHostRepository } from '../persistence/repositories/host.repository.ts'

/** Resources owned by one host relay Durable Object. */
export type HostRelayResources = {
  conversationRepository: DrizzleConversationRepository
  hostRepository: HostRepository
}

/** Construct resources from the relay database and child Agent resolver. */
export function createHostRelayResources(
  relayDb: RelayDb,
  applicationDb: () => Db,
): HostRelayResources {
  return {
    conversationRepository: new DrizzleConversationRepository(relayDb),
    hostRepository: new DrizzleHostRepository(applicationDb),
  }
}
