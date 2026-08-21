import type { PairedHost } from '@porte/core/client'
import type { RelayState } from '@web/entities/host/relay-state.ts'
import { formatDateTime } from '@web/lib/format-date.ts'
import { HostStatus } from '@web/ui/components/host-status.tsx'
import { Logo } from '@web/ui/components/logo.tsx'

type ConversationsHeaderProps = {
  /** From the database, so the Mac has a name before any socket exists. */
  readonly host: PairedHost
  readonly relay: RelayState
}

/** The Mac and how it is doing. What to do about it belongs to the page. */
export function ConversationsHeader({ host, relay }: ConversationsHeaderProps) {
  return (
    <header className="flex flex-col gap-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Logo size="sm" />

      <div className="flex min-w-0 flex-col gap-2">
        <h1>Conversations</h1>
        <div className="flex min-w-0 items-center gap-2">
          <strong className="truncate">{host.name}</strong>
          <HostStatus detail={detail(host, relay)} status={status(relay)} />
        </div>
      </div>
    </header>
  )
}

function status(relay: RelayState): 'loading' | 'online' | 'offline' | 'reconnecting' {
  if (relay.line === 'reconnecting') return 'reconnecting'
  if (relay.mac === null) return 'loading'

  return relay.mac.online ? 'online' : 'offline'
}

/**
 * When the Mac was last seen, and only when that is worth saying.
 *
 * The relay reports the moment it arrived; the database remembers the last one
 * before that. Neither belongs beside a Mac that is on screen and answering.
 */
function detail(host: PairedHost, relay: RelayState): string | undefined {
  if (relay.mac === null || relay.mac.online) return undefined

  const seen = relay.mac.lastSeenAt ?? host.lastSeenAt
  return seen === null ? 'Never connected' : `Last seen ${formatDateTime(seen)}`
}
