import type { ConversationSummary } from '@porte/core/client'

/**
 * One repository on the Mac and the conversations opened inside it.
 *
 * Named here rather than in the component, so a screen renders a value instead
 * of deriving one.
 */
export type Project = {
  readonly gitRoot: string
  readonly name: string
  readonly conversations: readonly ConversationSummary[]
}

/**
 * Group conversations by repository. Newest first inside each.
 *
 * Every conversation has one: the Mac reports only those it can place in a
 * repository, which is what keeps a folder a test made and deleted out of the
 * list. Repositories appear in the order their newest conversation does.
 */
export function groupConversationsByRepo(
  conversations: readonly ConversationSummary[],
): readonly Project[] {
  const groups = new Map<string, ConversationSummary[]>()
  for (const conversation of conversations) {
    const rows = groups.get(conversation.gitRoot) ?? []
    rows.push(conversation)
    groups.set(conversation.gitRoot, rows)
  }
  return [...groups.entries()].map(([gitRoot, rows]) => ({
    gitRoot,
    name: repoName(gitRoot),
    conversations: rows.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  }))
}

export function repoName(gitRoot: string): string {
  const parts = gitRoot.split('/').filter(Boolean)
  return parts.at(-1) ?? gitRoot
}
