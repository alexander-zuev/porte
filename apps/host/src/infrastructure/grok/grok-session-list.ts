import { CodingAgentResponseError } from '@host/application/errors/coding-agent-errors.ts'
import type { AcpClient } from '@host/infrastructure/acp/client.ts'
import {
  CodingAgentUnavailableError,
  ConversationIdSchema,
  IsoDateTimeSchema,
  makeConversation,
  type Conversation,
} from '@porte/core/client'
import { z } from 'zod'

import { normaliseGitRoot } from './git-root.ts'

/** Grok's own names for what it records about a session. Renamed only on the way out. */
const facetsSchema = z.object({
  gitRoot: z.string().min(1).optional(),
})

const sessionSchema = z.object({
  sessionId: ConversationIdSchema,
  cwd: z.string().min(1),
  title: z.string().optional(),
  updatedAt: IsoDateTimeSchema,
  _meta: z.object({ 'x.ai/session': z.object({ facets: facetsSchema }).optional() }).optional(),
})

const sessionListSchema = z.object({
  sessions: z.array(sessionSchema),
  nextCursor: z.string().min(1).nullish(),
})

/**
 * How many pages one listing may walk.
 *
 * Grok fixes its own page size and ignores `limit`, so the only bound available
 * here is a page count. High enough for a real history, low enough that a
 * cursor that never terminates cannot hold the sync open forever.
 */
const MAX_PAGES = 40

type AcpRequester = Pick<AcpClient, 'request'>

/**
 * Read every Grok session that belongs to a repository.
 *
 * Sessions outside one are dropped here rather than downstream. Grok records
 * the repository when the session starts, so a temporary folder that a test
 * created and deleted never had a `gitRoot` and never becomes a row anyone has
 * to look at.
 *
 * Pages until the cursor runs out. Grok fixes the page size itself.
 */
export async function listGrokSessions(client: AcpRequester): Promise<Conversation[]> {
  const listed: Conversation[] = []
  let cursor: string | undefined

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let answered
    try {
      // oxlint-disable-next-line no-await-in-loop -- Each page needs the previous page's cursor.
      answered = await client.request({
        method: 'session/list',
        params: cursor === undefined ? {} : { cursor },
        timeoutMs: 30_000,
      })
    } catch (cause) {
      throw new CodingAgentUnavailableError({ cause })
    }

    const parsed = sessionListSchema.safeParse(answered)
    if (!parsed.success) {
      throw new CodingAgentResponseError({ cause: parsed.error })
    }

    for (const session of parsed.data.sessions) {
      const summary = toSummary(session)
      if (summary !== undefined) listed.push(summary)
    }

    const next = parsed.data.nextCursor
    if (next === undefined || next === null) break
    cursor = next
  }

  listed.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return listed
}

function toSummary(session: z.infer<typeof sessionSchema>): Conversation | undefined {
  // oxlint-disable-next-line no-underscore-dangle -- ACP requires the exact `_meta` name.
  const gitRoot = session._meta?.['x.ai/session']?.facets.gitRoot
  if (gitRoot === undefined) return undefined

  return makeConversation({
    id: session.sessionId,
    cwd: session.cwd,
    gitRoot: normaliseGitRoot(gitRoot),
    title: session.title ?? '',
    updatedAt: session.updatedAt,
  })
}
