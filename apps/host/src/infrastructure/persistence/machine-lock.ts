import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { LockAcquisition, MachineLock } from '@host/application/ports/machine-lock.ts'
import { isProcessAlive } from '@host/infrastructure/node/process-liveness.ts'
import { z } from 'zod'

const LockFileSchema = z.object({ pid: z.number().int() })

/**
 * Pid-file lock in the Porte data directory.
 *
 * Liveness is the pid, not the file: a lock whose holder is dead is stolen.
 * Daemons on one machine share one filesystem, so no stronger primitive is needed.
 */
export class FileMachineLock implements MachineLock {
  private readonly path: string
  private holding = false

  constructor(private readonly dataDirectory: string) {
    this.path = join(dataDirectory, 'host.lock')
  }

  async acquire(): Promise<LockAcquisition> {
    if (this.holding) return { type: 'held' }
    await mkdir(this.dataDirectory, { recursive: true })

    // Two rounds: exclusive create, and after a stale steal one more create.
    for (let round = 0; round < 2; round += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Each round depends on the last one's outcome.
        await writeFile(this.path, JSON.stringify({ pid: process.pid }), { flag: 'wx' })
        this.holding = true
        return { type: 'held' }
      } catch {
        // The file exists: someone holds it, or a dead holder left it behind.
      }
      // oxlint-disable-next-line no-await-in-loop -- Each round depends on the last one's outcome.
      const holder = await this.currentHolder()
      if (holder !== null && isProcessAlive(holder)) {
        return { type: 'held-elsewhere', pid: holder }
      }
      // oxlint-disable-next-line no-await-in-loop -- Each round depends on the last one's outcome.
      await rm(this.path, { force: true })
    }

    // Lost the steal race twice; whoever won it is the holder.
    const holder = await this.currentHolder()
    return holder === null
      ? { type: 'held-elsewhere', pid: 0 }
      : { type: 'held-elsewhere', pid: holder }
  }

  async release(): Promise<void> {
    if (!this.holding) return
    this.holding = false
    await rm(this.path, { force: true })
  }

  private async currentHolder(): Promise<number | null> {
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch {
      return null
    }
    try {
      const parsed = LockFileSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data.pid : null
    } catch {
      // A corrupt lock file is a free lock.
      return null
    }
  }
}
