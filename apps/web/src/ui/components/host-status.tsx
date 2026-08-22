import { ArrowClockwiseIcon } from '@phosphor-icons/react'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { cn } from '@web/lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'

type HostStatusProps = {
  readonly connection: HostConnection
  readonly detail?: string
}

/**
 * How each state reads, and why.
 *
 * `connecting` carries no visible word. It lasts a moment, and a word that
 * appears and then leaves moves the line beside it and reads as a fault.
 *
 * `offline` is neutral, not red. A closed laptop is where a Mac rests. Red is
 * kept for `lost`, the one state the page cannot leave on its own.
 */
const STATUS = {
  connecting: { label: 'Connecting', dot: 'animate-pulse bg-muted-foreground', quiet: true },
  online: { label: 'Online', dot: 'bg-status-success', quiet: false },
  offline: { label: 'Offline', dot: 'bg-muted-foreground', quiet: false },
  reconnecting: { label: 'Reconnecting', dot: 'animate-pulse bg-status-warning', quiet: false },
  lost: { label: 'Disconnected', dot: 'bg-destructive', quiet: false },
} as const satisfies Record<
  HostConnection['status'],
  { readonly label: string; readonly dot: string; readonly quiet: boolean }
>

export function HostStatus({ connection, detail }: HostStatusProps) {
  const { label, dot, quiet } = STATUS[connection.status]

  return (
    <small className="inline-flex items-center gap-2 text-muted-foreground">
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', dot)} />
      {/* Written even when quiet: the dot is decoration, so this word is the
          only thing a screen reader is given. */}
      <span className={cn(quiet && 'sr-only')}>{label}</span>
      {detail ? <span>{detail}</span> : null}
      {connection.status === 'lost' ? (
        <Button aria-label="Reconnect" size="icon-xs" variant="ghost" onClick={connection.onRetry}>
          <ArrowClockwiseIcon aria-hidden />
        </Button>
      ) : null}
    </small>
  )
}

export function HostOfflineAlert() {
  return (
    <Alert>
      <AlertTitle>Host is offline</AlertTitle>
      <AlertDescription>Open the daemon on the Mac, then retry.</AlertDescription>
    </Alert>
  )
}
