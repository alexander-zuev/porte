import type { SessionInfo } from '@agentclientprotocol/sdk'
import { CodingAgentResponseError } from '@host/application/errors/coding-agent-errors.ts'
import type { SessionFacts } from '@host/application/ports/coding-agent.ts'
import { normaliseGitRoot } from '@host/infrastructure/grok/git-root.ts'
import { ConversationIdSchema, IsoDateTimeSchema } from '@porte/core/client'
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

/** Parse one Grok `session/list` row into session facts, or skip rows with no git root. */
export function toSessionFacts(session: SessionInfo): SessionFacts | undefined {
  const parsed = grokSessionSchema.safeParse(session)
  if (!parsed.success) throw new CodingAgentResponseError({ cause: parsed.error })
  // oxlint-disable-next-line no-underscore-dangle -- ACP reserves `_meta` for provider data.
  const gitRoot = parsed.data._meta?.['x.ai/session']?.facets.gitRoot
  if (gitRoot === undefined) return undefined
  return {
    id: parsed.data.sessionId,
    cwd: parsed.data.cwd,
    gitRoot: normaliseGitRoot(gitRoot),
    title: parsed.data.title ?? '',
    updatedAt: parsed.data.updatedAt,
  }
}
