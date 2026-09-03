import type { AttemptBindings } from '@host/application/ports/attempt-bindings.ts'
import type { AttemptId, TurnId } from '@porte/core/client'

type Waiter = {
  readonly promise: Promise<TurnId>
  readonly resolve: (turnId: TurnId) => void
  readonly reject: (cause: unknown) => void
}

/**
 * `AttemptBindings` in RAM: one waiter per attempt, shared by every request
 * that asks for the same attempt, gone once answered.
 */
export class InMemoryAttemptBindings implements AttemptBindings {
  private readonly waiters = new Map<AttemptId, Waiter>()

  wait(attemptId: AttemptId): Promise<TurnId> {
    const existing = this.waiters.get(attemptId)
    if (existing !== undefined) return existing.promise
    const { promise, resolve, reject } = Promise.withResolvers<TurnId>()
    this.waiters.set(attemptId, { promise, resolve, reject })
    return promise
  }

  bound(attemptId: AttemptId, turnId: TurnId): void {
    const waiter = this.waiters.get(attemptId)
    if (waiter === undefined) return
    this.waiters.delete(attemptId)
    waiter.resolve(turnId)
  }

  failed(attemptId: AttemptId, cause: unknown): void {
    const waiter = this.waiters.get(attemptId)
    if (waiter === undefined) return
    this.waiters.delete(attemptId)
    waiter.reject(cause)
  }
}
