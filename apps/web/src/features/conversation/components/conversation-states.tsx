import { ChatCircleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { PairedHost } from '@porte/core/client'
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
}: {
  readonly error: unknown
  readonly host: PairedHost
  readonly onRetry: () => void
}) {
  const failure = readErrorPayload(error)
  const retry = (
    <Button className="min-h-11" variant="outline" onClick={onRetry}>
      Try again
    </Button>
  )

  if (failure._tag === 'HostOfflineError') {
    return <StartPorteOnMac hostName={host.name} lastSeenAt={host.lastSeenAt} />
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
 * Opened, and nothing has been said in it.
 *
 * The same layout as an empty project list, so an empty conversation and an
 * empty list read as one place with nothing in it rather than two screens.
 */
export function NoMessagesYet() {
  return (
    <EmptyState
      body="Send your first prompt. It runs on the Mac, and the answer appears here."
      icon={<ChatCircleIcon aria-hidden />}
      title="No messages yet"
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
