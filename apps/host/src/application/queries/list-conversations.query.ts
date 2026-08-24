import type { CodingAgent, CodingAgentError } from '@host/application/ports/coding-agent.ts'
import {
  ConversationCatalog,
  type StaleConversationCursorError,
} from '@host/domain/conversation/conversation-catalog.ts'
import {
  createRequestId,
  type HostControlMethodMap,
  type ListConversationsResult,
} from '@porte/core/client'
import { Result, type Result as ResultType } from 'better-result'

/** Read one stable page from the coding agent's conversation list. */
export async function listConversations(
  agent: Pick<CodingAgent, 'listConversations'>,
  catalog: ConversationCatalog,
  query: HostControlMethodMap['conversations.list']['params'],
): Promise<ResultType<ListConversationsResult, CodingAgentError | StaleConversationCursorError>> {
  if (query.cursor !== undefined) return catalog.continue(query.cursor, query.limit)

  const listed = await agent.listConversations()
  if (listed.isErr()) return listed
  return Result.ok(catalog.start(createRequestId(), listed.value, query.limit))
}
