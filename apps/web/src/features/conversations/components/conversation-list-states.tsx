import { FolderIcon } from '@phosphor-icons/react'
import { EmptyState } from '@web/ui/components/empty-state.tsx'

/**
 * Every situation the conversation list can be in instead of a list.
 *
 * Named one per situation rather than assembled at the call site: `EmptyState`
 * is a layout, so several different meanings wearing it read as one thing. A
 * page branches to a name, and each name is a story on its own.
 *
 * Waiting is not among them. A list on its way is a skeleton of the list, not a
 * centred message about the list.
 */

/** Reachable, and nothing has ever been opened on it. */
export function NoConversationsYet() {
  return (
    <EmptyState
      body="Open Porte from a repository on the machine to start your first one."
      icon={<FolderIcon aria-hidden />}
      title="No conversations yet"
    />
  )
}
