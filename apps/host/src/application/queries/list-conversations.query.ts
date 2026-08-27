import type { ListSessionsResponse, SessionInfo } from '@agentclientprotocol/sdk'
import { CodingAgentResponseError } from '@host/application/errors/coding-agent-errors.ts'
import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import { normaliseGitRoot } from '@host/infrastructure/grok/git-root.ts'
import {
  ConversationCursorSchema,
  ConversationIdSchema,
  IsoDateTimeSchema,
  makeConversationSummary,
  type ConversationSummary,
  type HostControlMethodMap,
  type ListConversationsResult,
} from '@porte/core/client'
import { z } from 'zod'

const grokSessionSchema = z.object({
  sessionId: ConversationIdSchema,
  cwd: z.string().min(1),
  title: z.string().optional(),
  updatedAt: IsoDateTimeSchema,
  _meta: z
    .object({
      'x.ai/session': z
        .object({ facets: z.object({ gitRoot: z.string().min(1).optional() }) })
        .optional(),
    })
    .optional(),
})

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

function toSummary(session: SessionInfo): ConversationSummary | undefined {
  const parsed = grokSessionSchema.safeParse(session)
  if (!parsed.success) throw new CodingAgentResponseError({ cause: parsed.error })
  // oxlint-disable-next-line no-underscore-dangle -- ACP reserves `_meta` for provider data.
  const gitRoot = parsed.data._meta?.['x.ai/session']?.facets.gitRoot
  if (gitRoot === undefined) return undefined
  return makeConversationSummary({
    id: parsed.data.sessionId,
    cwd: parsed.data.cwd,
    gitRoot: normaliseGitRoot(gitRoot),
    title: parsed.data.title ?? '',
    updatedAt: parsed.data.updatedAt,
  })
}
