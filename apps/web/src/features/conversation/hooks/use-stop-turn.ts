import { notYetImplemented, type TurnId } from '@porte/core/client'

import type { ConversationAgentClient } from './use-conversation-agent.ts'

/** What Stop looks like to the composer: a command in flight, not an aborted stream. */
export type StopTurn = {
  /** Ask the Mac to cancel the running turn. No-op when nothing runs. */
  readonly onStop: () => void
  /** True from the click until the Host reports `turn.finished`. */
  readonly stopping: boolean
}

/**
 * Stop as a command: `cancelTurn` on the Host; the stream ends when the Host
 * sends `turn.finished`, never by aborting the SDK stream (plan §5.3).
 *
 * @param agent - The conversation socket.
 * @param runningTurnId - The Mac's running turn from the live state, if any.
 */
export function useStopTurn(
  agent: ConversationAgentClient,
  runningTurnId: TurnId | undefined,
): StopTurn {
  // TODO(step 4): useMutation over `agent.stub.cancelTurn`; `stopping` until `runningTurnId` clears.
  void agent
  void runningTurnId
  return notYetImplemented('step 4')
}
