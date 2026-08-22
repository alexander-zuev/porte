import { DesktopIcon, FolderIcon } from '@phosphor-icons/react'
import { UP_COMMAND } from '@web/lib/product.ts'
import { EmptyState } from '@web/ui/components/empty-state.tsx'
import { TerminalCommand } from '@web/ui/components/terminal-command.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

/**
 * Every situation the conversation list can be in instead of a list.
 *
 * Named one per situation rather than assembled at the call site: `EmptyState`
 * is a layout, so six different meanings wearing it read as one thing. A page
 * branches to a name, and each name is a story on its own.
 */

/** The line is opening. Never say offline here: the Mac may be perfectly awake. */
export function LookingForMac() {
  return <EmptyState body="Looking for your Mac." icon={<Spinner />} title="Connecting" />
}

/** The read is in flight, which the loader normally settles before this renders. */
export function ReadingConversations() {
  return <EmptyState body="Reading your conversations." icon={<Spinner />} title="One moment" />
}

/** Paired but not running. The one screen that asks something of anyone. */
export function StartPorteOnMac() {
  return (
    <EmptyState
      action={<TerminalCommand command={UP_COMMAND} />}
      body="Your Mac is paired but not running Porte. Start it there to work from here."
      icon={<DesktopIcon aria-hidden />}
      title="Start Porte on your Mac"
    />
  )
}

/** Reachable, and nothing has ever been opened on it. */
export function NoConversationsYet() {
  return (
    <EmptyState
      body="Open Porte from a repository on the Mac to start your first one."
      icon={<FolderIcon aria-hidden />}
      title="No conversations yet"
    />
  )
}
