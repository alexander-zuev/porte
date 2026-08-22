import { FolderIcon, LaptopIcon } from '@phosphor-icons/react'
import { formatTimeAgo } from '@web/lib/format-date.ts'
import { UP_COMMAND } from '@web/lib/product.ts'
import { EmptyState } from '@web/ui/components/empty-state.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
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

/**
 * Paired but not running. The one screen that asks something of anyone.
 *
 * Named by the Mac rather than by the problem: the person knows which machine
 * that is, and going to it is the whole of what they have to do.
 *
 * Nothing polls. The relay pushes `host.status` the moment the daemon connects,
 * so this screen leaves on its own. The button is for the other case, where our
 * own socket died and no push can reach us.
 */
export function StartPorteOnMac({
  hostName,
  lastSeenAt,
  reconnecting,
  onReconnect,
}: {
  readonly hostName: string
  readonly lastSeenAt: string | null
  readonly reconnecting: boolean
  readonly onReconnect: () => void
}) {
  return (
    <EmptyState
      action={
        // The word leaves while it works, but the button keeps its size: a
        // control that shrinks under the finger that pressed it reads as a
        // different control.
        <Button
          aria-label={reconnecting ? 'Looking for your Mac' : undefined}
          className="min-w-28"
          disabled={reconnecting}
          variant="outline"
          onClick={onReconnect}
        >
          {reconnecting ? <Spinner /> : 'Reconnect'}
        </Button>
      }
      body={
        <>
          Make sure <code>{UP_COMMAND}</code> is running on this computer.
        </>
      }
      icon={<LaptopIcon aria-hidden />}
      meta={
        lastSeenAt === null ? (
          'Offline · never connected'
        ) : (
          <>
            Offline · last seen{' '}
            <time dateTime={lastSeenAt} suppressHydrationWarning>
              {formatTimeAgo(lastSeenAt)}
            </time>
          </>
        )
      }
      title={hostName}
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
