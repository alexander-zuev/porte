import type { Scheduler } from '@host/application/ports/scheduler.ts'

/** Node timers, unref'd so a pending deadline never blocks shutdown. */
export class NodeScheduler implements Scheduler {
  schedule(delayMs: number, task: () => void): void {
    setTimeout(task, delayMs).unref()
  }
}
