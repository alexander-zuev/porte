import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { cn } from '@web/lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

/**
 * What each settled state looks like.
 *
 * A dot and nothing else. The word it replaces said the same thing twice, and
 * a status that appears and then leaves moves the line beside it.
 *
 * `offline` is red: nothing on these screens works without the Mac, so it is
 * the one state a glance has to catch.
 */
const SETTLED = {
  online: { label: 'Online', dot: 'bg-status-success' },
  offline: { label: 'Offline', dot: 'bg-destructive' },
} as const satisfies Record<
  Exclude<HostConnection, 'loading'>,
  { readonly label: string; readonly dot: string }
>

/**
 * The dot alone. Its word is written for a screen reader, never shown.
 *
 * Still looking is a spinner rather than a pulsing dot: a dot says the Mac is
 * in some state, and a fading one reads as a state we are reporting instead of
 * a question we have not answered yet.
 */
export function HostStatus({ connection }: { readonly connection: HostConnection }) {
  if (connection === 'loading') {
    return <Spinner aria-label="Looking for your Mac" className="size-3 text-muted-foreground" />
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
      <AlertDescription>Open the daemon on the Mac, then retry.</AlertDescription>
    </Alert>
  )
}
