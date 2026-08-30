import { platformLabel, type PairedHost } from '@porte/core/client'
import type { HostConnectionStatus } from '@web/entities/host/host-connection.ts'
import { formatDateTime } from '@web/lib/format-date.ts'
import { HostStatus } from '@web/ui/components/host-status.tsx'

/** The paired machine in two lines: status dot, name, platform; then when it was last seen. */
export function PairedMachineSummary({
  host,
  connection,
}: {
  readonly host: PairedHost
  readonly connection: HostConnectionStatus
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex min-w-0 items-center gap-2">
        <HostStatus connection={connection} />
        <strong className="break-words">{host.name}</strong>
        <small className="text-muted-foreground">({platformLabel(host.platform)})</small>
      </span>
      <small className="text-muted-foreground">
        {host.lastSeenAt === null ? (
          'Never connected'
        ) : (
          <>
            Last seen:{' '}
            <time dateTime={host.lastSeenAt} suppressHydrationWarning>
              {formatDateTime(host.lastSeenAt)}
            </time>
          </>
        )}
      </small>
    </div>
  )
}
