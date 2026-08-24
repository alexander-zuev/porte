import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { ConversationCreationStore } from '@host/application/ports/conversation-creation-store.ts'
import type { ConversationCatalog } from '@host/domain/conversation/conversation-catalog.ts'

/** Application resources shared by Host message handlers. */
export type HostApplicationResources = {
  readonly agent: CodingAgent
  readonly catalog: ConversationCatalog
  readonly creations: ConversationCreationStore
}
