import { ConversationCatalog } from '@host/application/conversation-catalog.ts'
import type { AgentSessionFactory } from '@host/application/ports/agent-session-factory.ts'
import {
  createRequestId,
  type HostControlMethodMap,
  type ListConversationsResult,
} from '@porte/core/client'

/** Read one stable page from the coding agent's conversation list. */
export async function listConversations(
  factory: Pick<AgentSessionFactory, 'list'>,
  catalog: ConversationCatalog,
  query: HostControlMethodMap['conversations.list']['params'],
): Promise<ListConversationsResult> {
  if (query.cursor !== undefined) return catalog.continue(query.cursor, query.limit)

  const listed = await factory.list()
  return catalog.start(createRequestId(), listed, query.limit)
}
