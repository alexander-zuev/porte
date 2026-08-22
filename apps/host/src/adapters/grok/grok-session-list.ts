import type { AcpClient } from '@host/adapters/acp/client.ts'
import {
  ConversationIdSchema,
  IsoDateTimeSchema,
  makeConversationSummary,
  type ConversationSummary,
  type FailureClassification,
} from '@porte/core/client'
import { Result, TaggedError, type Result as ResultType } from 'better-result'
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

/**
 * Grok could not be asked for its sessions, or answered unreadably.
 *
 * The two are kept apart because only one is worth trying again: a control
 * process that died comes back, an answer this version cannot parse will not.
 */
export class GrokSessionListError extends TaggedError('GrokSessionListError')<{
  kind: 'unreachable' | 'unreadable'
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { kind: 'unreachable' | 'unreadable'; cause: unknown }) {
    super({
      ...args,
      message:
        args.kind === 'unreachable'
          ? 'Grok did not answer session/list'
          : 'Grok returned an unreadable session list',
      classification: args.kind === 'unreachable' ? 'transient' : 'terminal',
    })
  }
}

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
export async function listGrokSessions(
  client: AcpRequester,
): Promise<ResultType<ConversationSummary[], GrokSessionListError>> {
  const listed: ConversationSummary[] = []
  let cursor: string | undefined

  for (let page = 0; page < MAX_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each page needs the previous page's cursor.
    const answered = await client.request({
      method: 'session/list',
      params: cursor === undefined ? {} : { cursor },
      timeoutMs: 30_000,
    })
    if (answered.isErr()) {
      return Result.err(new GrokSessionListError({ kind: 'unreachable', cause: answered.error }))
    }

    const parsed = sessionListSchema.safeParse(answered.value)
    if (!parsed.success) {
      return Result.err(new GrokSessionListError({ kind: 'unreadable', cause: parsed.error }))
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
  return Result.ok(listed)
}

function toSummary(session: z.infer<typeof sessionSchema>): ConversationSummary | undefined {
  const gitRoot = session._meta?.['x.ai/session']?.facets.gitRoot
  if (gitRoot === undefined) return undefined

  return makeConversationSummary({
    id: session.sessionId,
    cwd: session.cwd,
    gitRoot: normaliseGitRoot(gitRoot),
    title: session.title ?? '',
    updatedAt: session.updatedAt,
  })
}
