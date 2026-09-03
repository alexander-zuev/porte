import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type { LockAcquisition, MachineLock } from '@host/application/ports/machine-lock.ts'
import { VERSION } from '@host/entrypoints/cli/version.ts'
import { isProcessAlive } from '@host/infrastructure/node/process-liveness.ts'
import { isVersionBefore } from '@porte/core/client'
import { z } from 'zod'

/** `version` is absent in locks written before 0.3.1; those holders count as older. */
const LockFileSchema = z.object({ pid: z.number().int(), version: z.string().optional() })

type LockHolder = z.infer<typeof LockFileSchema>

/** How long a replaced holder gets to stop after SIGTERM before its lock is taken anyway. */
const REPLACE_GRACE_MS = 2_000
const REPLACE_POLL_MS = 100

/** Process facts the lock reads; tests substitute them so no real process is signalled. */
export type MachineLockProcesses = {
  readonly version: string
  readonly isAlive: (pid: number) => boolean
  readonly terminate: (pid: number) => void
}

const REAL_PROCESSES: MachineLockProcesses = {
  version: VERSION,
  isAlive: isProcessAlive,
  terminate: (pid) => {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Already gone; the liveness poll settles it.
    }
  },
}

/**
 * Pid-file lock in the Porte data directory.
 *
 * Liveness is the pid, not the file: a lock whose holder is dead is stolen. A
 * live holder from an older release is replaced: Grok keeps spawning the
 * daemon it loaded at its own start, so after a plugin update the old and the
 * new daemon coexist, and the connection must go to the new one. Daemons on
 * one machine share one filesystem, so no stronger primitive is needed.
 */
export class FileMachineLock implements MachineLock {
  private readonly path: string
  private holding = false

  constructor(
    private readonly dataDirectory: string,
    private readonly processes: MachineLockProcesses = REAL_PROCESSES,
  ) {
    this.path = join(dataDirectory, 'host.lock')
  }

  async acquire(): Promise<LockAcquisition> {
    if (this.holding) return { type: 'held' }
    await mkdir(this.dataDirectory, { recursive: true })
    let replaced: number | undefined

    // Two rounds: exclusive create, and after a steal one more create.
    for (let round = 0; round < 2; round += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Each round depends on the last one's outcome.
        await writeFile(this.path, JSON.stringify(this.ownRecord()), { flag: 'wx' })
        this.holding = true
        return replaced === undefined ? { type: 'held' } : { type: 'replaced', pid: replaced }
      } catch {
        // The file exists: someone holds it, or a dead holder left it behind.
      }
      // oxlint-disable-next-line no-await-in-loop -- Each round depends on the last one's outcome.
      const holder = await this.currentHolder()
      if (holder !== null && this.processes.isAlive(holder.pid)) {
        if (!this.isOlder(holder)) return { type: 'held-elsewhere', pid: holder.pid }
        // oxlint-disable-next-line no-await-in-loop -- Each round depends on the last one's outcome.
        await this.stop(holder.pid)
        replaced = holder.pid
      }
      // oxlint-disable-next-line no-await-in-loop -- Each round depends on the last one's outcome.
      await rm(this.path, { force: true })
    }

    // Lost the steal race twice; whoever won it is the holder.
    const holder = await this.currentHolder()
    return { type: 'held-elsewhere', pid: holder === null ? 0 : holder.pid }
  }

  async release(): Promise<void> {
    if (!this.holding) return
    this.holding = false
    await rm(this.path, { force: true })
  }

  private ownRecord(): LockHolder {
    return { pid: process.pid, version: this.processes.version }
  }

  private isOlder(holder: LockHolder): boolean {
    return holder.version === undefined || isVersionBefore(holder.version, this.processes.version)
  }

  /** SIGTERM, then wait for the pid to go; a holder that ignores it loses the lock anyway. */
  private async stop(pid: number): Promise<void> {
    this.processes.terminate(pid)
    const deadline = Date.now() + REPLACE_GRACE_MS
    while (this.processes.isAlive(pid) && Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop -- Polling is the point.
      await sleep(REPLACE_POLL_MS)
    }
  }

  private async currentHolder(): Promise<LockHolder | null> {
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch {
      return null
    }
    try {
      const parsed = LockFileSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      // A corrupt lock file is a free lock.
      return null
    }
  }
}
