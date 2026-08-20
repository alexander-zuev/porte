import { PlusIcon } from '@phosphor-icons/react'
import type { PairedHost } from '@porte/core'
import type { RelayState } from '@web/entities/host/relay-state.ts'
import { formatDateTime } from '@web/lib/format-date.ts'
import { HostStatus } from '@web/ui/components/host-status.tsx'
import { Logo } from '@web/ui/components/logo.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'

type ConversationsHeaderProps = {
  /** From the database, so the Mac has a name before any socket exists. */
  readonly host: PairedHost
  readonly relay: RelayState
  readonly onStartConversation: () => void
}

/** The Mac, how it is doing, and the one action that does not need it open. */
export function ConversationsHeader({
  host,
  relay,
  onStartConversation,
}: ConversationsHeaderProps) {
  // Anything sent down a closed line does not arrive, so the action goes first
  // and quietly. What went wrong is the body's business, and only after a beat.
  const reachable = relay.relay === 'open' && relay.mac?.online === true

  return (
    <header className="flex flex-col gap-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-4">
        <Logo size="sm" />
        <Button className="min-h-11" disabled={!reachable} size="sm" onClick={onStartConversation}>
          <PlusIcon data-icon="inline-start" />
          New conversation
        </Button>
      </div>

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
  if (relay.relay === 'reconnecting') return 'reconnecting'
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
