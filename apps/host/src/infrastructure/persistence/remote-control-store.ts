import { mkdir, readFile, rm, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  PendingPairing,
  RcPairingStore,
  RcSettings,
  RcSettingsRead,
  RcSettingsSnapshot,
  RcState,
  RcStateSnapshot,
} from '@host/application/ports/remote-control-store.ts'
import { isProcessAlive } from '@host/infrastructure/node/process-liveness.ts'
import { z } from 'zod'

const SettingsSchema = z.object({
  enabled: z.boolean(),
  hook: z.boolean().default(false),
  // On by default: a fresh install and a file from before the field both get the row.
  statusLine: z.boolean().default(true),
  // Files written before the counter existed count as write zero.
  generation: z.int().nonnegative().default(0),
})

const HostFailureSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unauthorized'), http: z.union([z.literal(401), z.literal(403)]) }),
  z.object({ type: z.literal('refused'), http: z.int() }),
  z.object({ type: z.literal('agent-start') }),
  z.object({ type: z.literal('protocol') }),
])

const StateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('on'), url: z.string().min(1), pid: z.number().int() }),
  z.object({ status: z.literal('off') }),
  z.object({ status: z.literal('connecting'), pid: z.number().int() }),
  z.object({ status: z.literal('error'), pid: z.number().int(), failure: HostFailureSchema }),
])

const PendingPairingSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUriComplete: z.string().min(1),
  expiresAtMs: z.number(),
})

/** The sticky on/off choice, one JSON file in the Porte data directory. */
export class FileRcSettings implements RcSettings {
  constructor(private readonly dataDirectory: string) {}

  async read(): Promise<RcSettingsRead> {
    const parsed = await readJson(join(this.dataDirectory, 'remote-control.json'), SettingsSchema)
    // A machine that never chose is off: connecting must be an explicit choice.
    return parsed ?? { enabled: false, hook: false, statusLine: true, generation: 0 }
  }

  async write(settings: RcSettingsSnapshot): Promise<void> {
    const { generation } = await this.read()
    await writeJson(this.dataDirectory, 'remote-control.json', {
      enabled: settings.enabled,
      hook: settings.hook,
      statusLine: settings.statusLine,
      generation: generation + 1,
    })
  }
}

/** The live connection fact. A snapshot whose writer is dead reads as off. */
export class FileRcState implements RcState {
  constructor(private readonly dataDirectory: string) {}

  async read(): Promise<RcStateSnapshot> {
    const parsed = await readJson(join(this.dataDirectory, 'rc-state.json'), StateSchema)
    if (parsed === null || parsed.status === 'off') return { status: 'off' }
    return isProcessAlive(parsed.pid) ? parsed : { status: 'off' }
  }

  async write(state: RcStateSnapshot): Promise<void> {
    await writeJson(this.dataDirectory, 'rc-state.json', state)
  }
}

/** The in-flight pairing, kept between rc invocations. */
export class FileRcPairingStore implements RcPairingStore {
  constructor(private readonly dataDirectory: string) {}

  async read(): Promise<PendingPairing | null> {
    return readJson(join(this.dataDirectory, 'rc-pairing.json'), PendingPairingSchema)
  }

  async write(pending: PendingPairing): Promise<void> {
    await writeJson(this.dataDirectory, 'rc-pairing.json', pending)
  }

  async clear(): Promise<void> {
    await rm(join(this.dataDirectory, 'rc-pairing.json'), { force: true })
  }
}

/** Absent, unreadable, and invalid all read as null: every caller has a safe default. */
async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return null
  }
  try {
    const result = schema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** Every value these stores persist. */
type StoredRcValue = RcSettingsRead | RcStateSnapshot | PendingPairing

/** Monotonic suffix so two writes from one process never share a temporary file. */
let writeSequence = 0

/** Write-then-rename, so a concurrent reader never sees a torn file. */
async function writeJson(directory: string, name: string, value: StoredRcValue): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  writeSequence += 1
  const temporary = join(directory, `${name}.${String(process.pid)}.${String(writeSequence)}.tmp`)
  // 0600: the pending pairing carries the device code, which is a secret.
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 })
  await rename(temporary, join(directory, name))
}
