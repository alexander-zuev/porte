import { LaptopIcon } from '@phosphor-icons/react'
import { formatTimeAgo } from '@web/lib/format-date.ts'
import { REMOTE_CONTROL_COMMAND } from '@web/lib/product.ts'
import { EmptyState } from '@web/ui/components/empty-state.tsx'

/**
 * The paired machine is not connected to the relay. Nothing here can change that;
 * the relay reports the machine the moment a Grok session connects, so there is no button.
 */
export function StartPorteOnMachine({
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
          Open a Grok session on this computer, with remote control on (
          <code>{REMOTE_CONTROL_COMMAND}</code>).
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
