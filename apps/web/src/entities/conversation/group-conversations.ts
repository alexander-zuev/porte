import type { ConversationSummary } from '@porte/core/client'

/**
 * One folder on the Mac and the conversations opened from it.
 *
 * Named here rather than in the component, so a screen renders a value instead
 * of deriving one. `name` is the last path segment today; a Mac that reports
 * its git root would put the repository's name here instead.
 */
export type Project = {
  readonly cwd: string
  readonly name: string
  readonly conversations: readonly ConversationSummary[]
}

/** Group conversations by the folder they were opened from. Newest first inside each. */
export function groupConversationsByCwd(
  conversations: readonly ConversationSummary[],
): readonly Project[] {
  const groups = new Map<string, ConversationSummary[]>()
  for (const conversation of conversations) {
    const rows = groups.get(conversation.cwd) ?? []
    rows.push(conversation)
    groups.set(conversation.cwd, rows)
  }
  return [...groups.entries()].map(([cwd, rows]) => ({
    cwd,
    name: repoName(cwd),
    conversations: rows.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  }))
}

export function repoName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts.at(-1) ?? cwd
}
