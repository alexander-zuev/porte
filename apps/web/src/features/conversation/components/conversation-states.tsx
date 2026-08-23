import { WarningCircleIcon } from '@phosphor-icons/react'
import type { PairedHost } from '@porte/core/client'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { StartPorteOnMac } from '@web/features/host/components/start-porte-on-mac.tsx'
import { readErrorPayload } from '@web/lib/errors/error-payload.ts'
import { EmptyState } from '@web/ui/components/empty-state.tsx'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'

/** The read failed. The tag decides what to say about it. */
export function ConversationFailed({
  error,
  host,
  onRetry,
  connection,
}: {
  readonly error: unknown
  readonly host: PairedHost
  readonly onRetry: () => void
  readonly connection: HostConnection
}) {
  const failure = readErrorPayload(error)
  const retry = (
    <Button className="min-h-11" variant="outline" onClick={onRetry}>
      Try again
    </Button>
  )

  if (failure._tag === 'HostOfflineError') {
    const reconnecting = connection.status === 'disconnected' && connection.reconnecting
    const reconnect = connection.status === 'disconnected' ? connection.reconnect : onRetry

    return (
      <StartPorteOnMac
        hostName={host.name}
        lastSeenAt={host.lastSeenAt}
        reconnecting={reconnecting}
        onReconnect={reconnect}
      />
    )
  }

  if (failure._tag === 'ConversationNotFoundError') {
    return (
      <EmptyState
        body="It may have been removed on the Mac."
        icon={<WarningCircleIcon aria-hidden />}
        title="That conversation is gone"
      />
    )
  }

  return (
    <EmptyState
      action={retry}
      body={failure.message}
      icon={<WarningCircleIcon aria-hidden />}
      title="Could not open this conversation"
    />
  )
}

/**
 * The turn stopped on its own.
 *
 * Beside the transcript rather than instead of it: whatever the agent already
 * said is still worth reading, and the next prompt still works.
 */
export function ConversationTurnFailed({ error }: { readonly error: Error }) {
  return (
    <Alert variant="destructive">
      <WarningCircleIcon aria-hidden />
      <AlertTitle>The answer stopped</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  )
}
