import type { BackgroundTasks } from '@host/application/ports/background-tasks.ts'
import { createLogger } from '@porte/core/client'

const logger = createLogger('background-tasks')

export class NodeBackgroundTasks implements BackgroundTasks {
  private readonly pending = new Set<Promise<void>>()

  run(task: Promise<void>): void {
    const tracked: Promise<void> = task
      .catch((cause: unknown) => {
        logger.error('background_task_failed', { error: cause })
      })
      .finally(() => {
        this.pending.delete(tracked)
      })
    this.pending.add(tracked)
  }

  async drain(): Promise<void> {
    await Promise.allSettled(this.pending)
  }
}
