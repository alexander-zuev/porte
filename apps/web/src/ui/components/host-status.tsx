import type { HostConnectionStatus } from '@web/entities/host/host-connection.ts'
import { cn } from '@web/lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

/**
 * What each state looks like once the relay has answered.
 *
 * A dot and nothing else. The word it replaces said the same thing twice, and
 * a status that appears and then leaves moves the line beside it.
 *
 * `offline` is red because these screens cannot work without the machine.
 * `connecting` flashes: the socket is retrying, the last known state is stale.
 */
const SETTLED = {
  connecting: { label: 'Reconnecting', dot: 'bg-muted-foreground animate-pulse' },
  connected: { label: 'Online', dot: 'bg-status-success' },
  offline: { label: 'Offline', dot: 'bg-destructive' },
} as const satisfies Record<
  Exclude<HostConnectionStatus, 'loading'>,
  { readonly label: string; readonly dot: string }
>

/**
 * The dot alone. Its word is written for a screen reader, never shown.
 *
 * Still looking is a spinner rather than a dot: a dot says the machine is in some
 * state, and we have not heard from the relay yet.
 */
export function HostStatus({ connection }: { readonly connection: HostConnectionStatus }) {
  if (connection === 'loading') {
    return (
      <Spinner aria-label="Looking for your machine" className="size-3 text-muted-foreground" />
    )
  }

  const { label, dot } = SETTLED[connection]

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
      <AlertDescription>Open the daemon on the machine, then retry.</AlertDescription>
    </Alert>
  )
}
