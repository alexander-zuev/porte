/**
 * Work that outlives the request that started it (a turn's prompt). Node has no
 * `waitUntil`, so the host tracks these itself and drains them at shutdown.
 * A rejected task is logged once by the implementation; it never surfaces.
 */
export interface BackgroundTasks {
  run(task: Promise<void>): void
  /** Settles once every task started so far has settled. */
  drain(): Promise<void>
}
