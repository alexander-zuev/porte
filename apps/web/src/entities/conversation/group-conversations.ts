import type { ConversationListItem } from './conversation-list.ts'

/**
 * One repository on the machine and the conversations opened inside it.
 *
 * Named here rather than in the component, so a screen renders a value instead
 * of deriving one.
 */
export type Project = {
  readonly gitRoot: string
  readonly name: string
  readonly conversations: readonly ConversationListItem[]
}

/**
 * Group conversations by repository. Newest first inside each.
 *
 * Every conversation has one: the machine reports only those it can place in a
 * repository, which is what keeps a folder a test made and deleted out of the
 * list. Repositories appear in the order their newest conversation does.
 */
export function groupConversationsByRepo(
  conversations: readonly ConversationListItem[],
): readonly Project[] {
  const groups = new Map<string, ConversationListItem[]>()
  for (const item of conversations) {
    const rows = groups.get(item.conversation.gitRoot) ?? []
    rows.push(item)
    groups.set(item.conversation.gitRoot, rows)
  }
  return [...groups.entries()].map(([gitRoot, rows]) => ({
    gitRoot,
    name: repoName(gitRoot),
    conversations: rows.toSorted((left, right) =>
      right.conversation.updatedAt.localeCompare(left.conversation.updatedAt),
    ),
  }))
}

export function repoName(gitRoot: string): string {
  const parts = gitRoot.split('/').filter(Boolean)
  return parts.at(-1) ?? gitRoot
}
