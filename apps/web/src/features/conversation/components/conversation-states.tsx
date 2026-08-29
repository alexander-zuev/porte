import { ChatCircleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { PairedHost } from '@porte/core/client'
import { StartPorteOnMachine } from '@web/features/host/components/start-porte-on-machine.tsx'
import { readErrorPayload } from '@web/lib/errors/error-payload.ts'
import { ReasoningPending } from '@web/ui/components/ai-elements/reasoning.tsx'
import { EmptyState } from '@web/ui/components/empty-state.tsx'
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
    return <StartPorteOnMachine hostName={host.name} lastSeenAt={host.lastSeenAt} />
  }

  if (failure._tag === 'ConversationNotFoundError') {
    return (
      <EmptyState
        body="It may have been removed on the machine."
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
      body="Send your first prompt. It runs on the machine, and the answer appears here."
      icon={<ChatCircleIcon aria-hidden />}
      title="No messages yet"
    />
  )
}

/**
 * The prompt is on the machine and nothing has come back yet.
 *
 * Rendered in the answer's own slot, so the answer replaces it in place and
 * nothing moves. A slow first token must not look like a prompt that never
 * left, and the send button at the foot of the screen is not where the eye is.
 */
export function TurnPending() {
  return <ReasoningPending />
}

/**
 * The turn stopped on its own.
 *
 * One line under the cut-off text, where "Thinking…" sat a moment before: it
 * explains that text, so it stays with it and scrolls away with it. Grok's
 * own words for the case; the cause follows when the error names one.
 */
export function ConversationTurnFailed({ error }: { readonly error: Error }) {
  return (
    <output className="flex items-center gap-2 text-muted-foreground">
      <WarningCircleIcon
        aria-hidden
        className="size-4 shrink-0 text-destructive-muted-foreground"
      />
      <small>
        Grok was unable to finish
        {error.message === '' ? null : <> · {error.message}</>}
      </small>
    </output>
  )
}
