import type { QueryHandler } from '@host/application/handlers/types.ts'
import type { QueryMap } from '@host/domain/messages/types.ts'
import { makeConversationSummary, type ListConversationsResult } from '@porte/core/client'

/** One page of the agent's conversation list; rows without a git root are not conversations. */
export const listConversations: QueryHandler<
  QueryMap['ListConversations'],
  ListConversationsResult
> = async (query, deps) => {
  const page = await deps.codingAgent.listSessions(query.cursor)
  const conversations = page.sessions.map(makeConversationSummary)
  return page.next === undefined ? { conversations } : { conversations, next: page.next }
}
