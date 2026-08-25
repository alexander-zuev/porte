import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { HostControlMethodMap, ListConversationsResult } from '@porte/core/client'

/** Read one stable page from the coding agent's conversation list. */
export async function listConversations(
  codingAgent: CodingAgent,
  query: HostControlMethodMap['conversations.list']['params'],
): Promise<ListConversationsResult> {
  return codingAgent.listConversations(query.cursor)
}
