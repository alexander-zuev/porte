import { cn } from '#/lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '#/ui/components/ui/alert.tsx'

type HostStatusProps = {
  readonly online: boolean
}

export function HostStatus({ online }: HostStatusProps) {
  return (
    <small className="inline-flex items-center gap-2 text-muted-foreground">
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          online ? 'bg-status-online' : 'bg-status-offline',
        )}
        aria-hidden
      />
      {online ? 'Online' : 'Offline'}
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
