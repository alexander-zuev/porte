import type { TurnId } from '@porte/core/client'
import { useMutation } from '@tanstack/react-query'

import type { ConversationAgentStub } from './use-conversation-agent.ts'

/** What Stop looks like to the composer: a command in flight, not an aborted stream. */
export type StopTurn = {
  /** Ask the machine to cancel the running turn. No-op when nothing runs. */
  readonly onStop: () => void
  /** True from the click until the Host reports `turn.finished`. */
  readonly stopping: boolean
}

/**
 * Stop as a command: `cancelTurn` on the Host; the stream ends when the Host
 * sends `turn.finished`, never by aborting the SDK stream.
 *
 * @param stub - The conversation callables.
 * @param runningTurnId - The machine's running turn from the live state, if any.
 */
export function useStopTurn(
  stub: ConversationAgentStub,
  runningTurnId: TurnId | undefined,
): StopTurn {
  const cancel = useMutation({ mutationFn: (turnId: TurnId) => stub.cancelTurn({ turnId }) })
  return {
    onStop: () => {
      if (runningTurnId !== undefined) cancel.mutate(runningTurnId)
    },
    // Derived, not stored: `turn.finished` clears `runningTurnId` and with it this flag.
    stopping: runningTurnId !== undefined && cancel.variables === runningTurnId && !cancel.isError,
  }
}
