import type { AttemptId, TurnId } from '@porte/core/client'

/**
 * Where a `turn.start` request waits for its turn.
 *
 * The Host hands the prompt to the agent and learns the turn id from the
 * stream, when the agent echoes the prompt. The request answers then, or when
 * the agent refused the prompt. In RAM only: a restart drops every wait.
 */
export interface AttemptBindings {
  /** Resolves with the turn id once bound; rejects with the agent's refusal. */
  wait(attemptId: AttemptId): Promise<TurnId>
  /** The stream named the turn this attempt started. No-op when nobody waits. */
  bound(attemptId: AttemptId, turnId: TurnId): void
  /** The agent refused the prompt before any turn started. No-op when nobody waits. */
  failed(attemptId: AttemptId, cause: unknown): void
}
