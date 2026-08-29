/**
 * Deferred work on this process: cancel deadlines and idle eviction.
 *
 * Fire-and-forget by design: a fired task dispatches an idempotent command, so
 * a lost timer costs one delayed cleanup, never correctness. Timers must not
 * keep the process alive.
 */
export interface Scheduler {
  /** Run `task` after `delayMs`. */
  schedule(delayMs: number, task: () => void): void
}
