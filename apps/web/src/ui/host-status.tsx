import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'
import { cn } from '#/lib/utils.ts'

type HostStatusProps = {
  readonly online: boolean
}

export function HostStatus({ online }: HostStatusProps) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          online ? 'bg-status-online' : 'bg-status-offline',
        )}
        aria-hidden
      />
      {online ? 'Online' : 'Offline'}
    </span>
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
