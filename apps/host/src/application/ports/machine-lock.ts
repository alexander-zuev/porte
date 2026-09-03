/** The answer to one attempt to become this machine's connected daemon. */
export type LockAcquisition =
  | { readonly type: 'held' }
  /** An older release held it; it was told to stop and this daemon took over. */
  | { readonly type: 'replaced'; readonly pid: number }
  | { readonly type: 'held-elsewhere'; readonly pid: number }

/**
 * Elects one connected daemon per machine.
 *
 * Every Grok session spawns its own daemon; only the holder connects to the
 * relay. A lock whose holder is dead counts as free, and a holder from an
 * older release yields to a newer one.
 */
export interface MachineLock {
  /** Try to become the holder. Never waits. */
  acquire(): Promise<LockAcquisition>

  /** Give the lock up. Safe to call while not holding it. */
  release(): Promise<void>
}
