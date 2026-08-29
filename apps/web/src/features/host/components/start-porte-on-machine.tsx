import { LaptopIcon } from '@phosphor-icons/react'
import { formatTimeAgo } from '@web/lib/format-date.ts'
import { UP_COMMAND } from '@web/lib/product.ts'
import { EmptyState } from '@web/ui/components/empty-state.tsx'

/**
 * The paired Mac is not connected to the relay. Nothing here can change that;
 * the relay reports the Mac the moment `porte up` connects, so there is no button.
 */
export function StartPorteOnMac({
  hostName,
  lastSeenAt,
}: {
  readonly hostName: string
  readonly lastSeenAt: string | null
}) {
  return (
    <EmptyState
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
