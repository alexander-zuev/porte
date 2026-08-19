import { cn } from '#/lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '#/ui/components/ui/alert.tsx'

type HostStatusProps = {
  readonly status: 'loading' | 'online' | 'offline' | 'reconnecting'
  readonly detail?: string
}

const STATUS_LABEL = {
  loading: 'Loading',
  online: 'Online',
  offline: 'Offline',
  reconnecting: 'Reconnecting',
} as const

export function HostStatus({ status, detail }: HostStatusProps) {
  return (
    <small className="inline-flex items-center gap-2 text-muted-foreground">
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          status === 'online' ? 'bg-status-success' : 'bg-muted-foreground',
          status === 'reconnecting' && 'animate-pulse bg-status-warning',
        )}
        aria-hidden
      />
      <span>{STATUS_LABEL[status]}</span>
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
