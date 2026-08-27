import type { ListSessionsResponse } from '@agentclientprotocol/sdk'
import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import { toSessionFacts } from '@host/infrastructure/grok/grok-session.ts'
import {
  ConversationCursorSchema,
  makeConversationSummary,
  type ConversationSummary,
  type HostControlMethodMap,
  type ListConversationsResult,
} from '@porte/core/client'

/** Read one stable page from the coding agent's conversation list. */
export async function listConversations(
  codingAgent: Pick<CodingAgent, 'listConversations'>,
  query: HostControlMethodMap['conversations.list']['params'],
): Promise<ListConversationsResult> {
  return toListResult(await codingAgent.listConversations(query.cursor))
}

function toListResult(listed: ListSessionsResponse): ListConversationsResult {
  const conversations = listed.sessions.flatMap((session) => {
    const summary = toSummary(session)
    return summary === undefined ? [] : [summary]
  })
  const cursor = listed.nextCursor
  return cursor === undefined || cursor === null
    ? { conversations }
    : { conversations, next: ConversationCursorSchema.parse(cursor) }
}

function toSummary(
  session: ListSessionsResponse['sessions'][number],
): ConversationSummary | undefined {
  const facts = toSessionFacts(session)
  if (facts === undefined) return undefined
  return makeConversationSummary(facts)
}
