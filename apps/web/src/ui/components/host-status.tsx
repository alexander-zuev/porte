import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { cn } from '@web/lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'

/**
 * How each state reads, and why.
 *
 * A dot and nothing else. The word it replaces said the same thing twice, and
 * a status that appears and then leaves moves the line beside it.
 *
 * `offline` is red: nothing on these screens works without the Mac, so it is
 * the one state a glance has to catch.
 */
const STATUS = {
  loading: { label: 'Loading', dot: 'animate-pulse bg-muted-foreground' },
  online: { label: 'Online', dot: 'bg-status-success' },
  offline: { label: 'Offline', dot: 'bg-destructive' },
} as const satisfies Record<HostConnection, { readonly label: string; readonly dot: string }>

/** The dot alone. Its word is written for a screen reader, never shown. */
export function HostStatus({ connection }: { readonly connection: HostConnection }) {
  const { label, dot } = STATUS[connection]

  return (
    <>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dot)} />
      <span className="sr-only">{label}</span>
    </>
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
