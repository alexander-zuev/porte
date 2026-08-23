import { LaptopIcon } from '@phosphor-icons/react'
import { formatTimeAgo } from '@web/lib/format-date.ts'
import { UP_COMMAND } from '@web/lib/product.ts'
import { EmptyState } from '@web/ui/components/empty-state.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

/** Shows the paired Mac and the action required while Porte is not connected. */
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
