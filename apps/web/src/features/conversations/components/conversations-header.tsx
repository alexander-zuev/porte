import type { PairedHost } from '@porte/core/client'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { formatDateTime } from '@web/lib/format-date.ts'
import { HostStatus } from '@web/ui/components/host-status.tsx'
import { Logo } from '@web/ui/components/logo.tsx'

type ConversationsHeaderProps = {
  /** From the database, so the Mac has a name before any socket exists. */
  readonly host: PairedHost
  readonly connection: HostConnection
}

/** The Mac and how it is doing. What to do about it belongs to the page. */
export function ConversationsHeader({ host, connection }: ConversationsHeaderProps) {
  return (
    <header className="flex flex-col gap-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Logo size="sm" />

      <div className="flex min-w-0 flex-col gap-2">
        <h1>Conversations</h1>
        <div className="flex min-w-0 items-center gap-2">
          <strong className="truncate">{host.name}</strong>
          <HostStatus connection={connection} detail={detail(host, connection)} />
        </div>
      </div>
    </header>
  )
}

/**
 * When the Mac was last seen, and only when that is worth saying.
 *
 * Nothing belongs beside a Mac that is on screen and answering, and nothing is
 * known yet while the read is in flight.
 */
function detail(host: PairedHost, connection: HostConnection): string | undefined {
  if (connection !== 'offline') return undefined

  return host.lastSeenAt === null
    ? 'Never connected'
    : `Last seen ${formatDateTime(host.lastSeenAt)}`
}
