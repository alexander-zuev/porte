import type { ConversationSummary } from '@porte/core'

export type ConversationGroup = {
  readonly cwd: string
  readonly conversations: readonly ConversationSummary[]
}

/** Group conversation rows by repo path. Newest row first inside each group. */
export function groupConversationsByCwd(
  conversations: readonly ConversationSummary[],
): readonly ConversationGroup[] {
  const groups = new Map<string, ConversationSummary[]>()
  for (const conversation of conversations) {
    const rows = groups.get(conversation.cwd) ?? []
    rows.push(conversation)
    groups.set(conversation.cwd, rows)
  }
  return [...groups.entries()].map(([cwd, rows]) => ({
    cwd,
    conversations: rows.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  }))
}

export function repoName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts.at(-1) ?? cwd
}
