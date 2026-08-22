import { WarningCircleIcon } from '@phosphor-icons/react'
import { toApiError } from '@web/lib/errors/rpc-error.ts'
import { EmptyState } from '@web/ui/components/empty-state.tsx'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

/** The transcript is being read from the Mac. No agent has started. */
export function ConversationOpening() {
  return <EmptyState body="Reading this conversation." icon={<Spinner />} title="One moment" />
}

/** The read failed. The tag decides what to say about it. */
export function ConversationFailed({
  error,
  onRetry,
}: {
  readonly error: unknown
  readonly onRetry: () => void
}) {
  const failure = toApiError(error)
  const retry = (
    <Button className="min-h-11" variant="outline" onClick={onRetry}>
      Try again
    </Button>
  )

  if (failure._tag === 'HostOfflineError') {
    return (
      <EmptyState
        action={retry}
        body="Porte is not running on it right now. Start it and this opens."
        icon={<WarningCircleIcon aria-hidden />}
        title="Your Mac is offline"
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
