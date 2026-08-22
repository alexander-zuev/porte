import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { cn } from '@web/lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'

type HostStatusProps = {
  readonly connection: HostConnection
  readonly detail?: string
}

/**
 * How each state reads, and why.
 *
 * `loading` carries no visible word. The read is one round trip, and a word
 * that appears and then leaves moves the line beside it and reads as a fault.
 *
 * `offline` is neutral, not red. A closed laptop is where a Mac rests, and
 * nothing has gone wrong that a colour should shout about.
 */
const STATUS = {
  loading: { label: 'Loading', dot: 'animate-pulse bg-muted-foreground', quiet: true },
  online: { label: 'Online', dot: 'bg-status-success', quiet: false },
  offline: { label: 'Offline', dot: 'bg-muted-foreground', quiet: false },
} as const satisfies Record<
  HostConnection,
  { readonly label: string; readonly dot: string; readonly quiet: boolean }
>

export function HostStatus({ connection, detail }: HostStatusProps) {
  const { label, dot, quiet } = STATUS[connection]

  return (
    <small className="inline-flex items-center gap-2 text-muted-foreground">
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', dot)} />
      {/* Written even when quiet: the dot is decoration, so this word is the
          only thing a screen reader is given. */}
      <span className={cn(quiet && 'sr-only')}>{label}</span>
      {detail ? <span>{detail}</span> : null}
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
