import { WarningCircleIcon } from '@phosphor-icons/react'
import { toApiError } from '@web/lib/errors/rpc-error.ts'
import { Button } from '@web/ui/components/ui/button.tsx'

import { EmptyState } from './empty-state.tsx'

export type ConversationsFailureProps = {
  readonly error: unknown
  readonly onRetry: () => void
}

/**
 * What the list says when it could not be read.
 *
 * An `EmptyState` like every other outcome, so a failed read is one more thing
 * the page can say rather than a screen that replaces it. The tag is the whole
 * decision: `toApiError` gives one to every failure, including a request that
 * never arrived.
 */
export function ConversationsFailure({ error, onRetry }: ConversationsFailureProps) {
  const failure = toApiError(error)
  const retry = (
    <Button className="min-h-11" variant="outline" onClick={onRetry}>
      Try again
    </Button>
  )

  switch (failure._tag) {
    case 'ServiceUnavailableError':
    case 'RequestTimeoutError':
      return (
        <EmptyState
          action={retry}
          body="Porte could not read the list in time. It is usually back within a moment."
          icon={<WarningCircleIcon aria-hidden />}
          title="Porte is busy"
        />
      )

    default:
      return (
        <EmptyState
          action={retry}
          body={failure.message}
          icon={<WarningCircleIcon aria-hidden />}
          title="Could not read your conversations"
        />
      )
  }
}
