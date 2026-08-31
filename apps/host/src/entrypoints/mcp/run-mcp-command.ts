import type { CredentialStore } from '@host/application/ports/credential-store.ts'
import type { MachineLock } from '@host/application/ports/machine-lock.ts'
import type { RelayStatus } from '@host/application/ports/relay-status.ts'
import type { RcSettings, RcState } from '@host/application/ports/remote-control-store.ts'
import { VERSION } from '@host/entrypoints/cli/version.ts'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

/** A started Host the daemon can wait on, shaped like `createHostRuntime`'s result. */
export type PairedRuntime = {
  readonly relayUrl: string
  readonly runtime: {
    run(onStatus?: (status: RelayStatus) => void): Promise<void>
  }
}

/** Everything one daemon reads, elects, and runs. */
export type McpDaemonDeps = {
  /** The MCP connection to the Grok session; its close ends the daemon. */
  readonly transport: Transport
  readonly lock: MachineLock
  readonly settings: Pick<RcSettings, 'read'>
  readonly state: RcState
  readonly credentials: Pick<CredentialStore, 'read'>
  /** Idempotent hook install; runs once per daemon, failures are not fatal. */
  readonly installHook: () => Promise<void>
  readonly createRuntime: (signal: AbortSignal) => Promise<PairedRuntime>
  /** How often the daemon re-reads the sticky choice and the lock. */
  readonly pollMs: number
  readonly sleep: (ms: number) => Promise<void>
}

/**
 * Run one Grok-session daemon until its MCP transport closes.
 *
 * The server exposes zero tools: MCP is the supervisor contract that makes
 * Grok start this process with the session and end it with the session. The
 * daemon's real work is the loop: hold the machine lock while enabled and
 * paired, run the Host, and publish the connection fact.
 */
export async function runMcpDaemon(deps: McpDaemonDeps): Promise<void> {
  const server = new McpServer({ name: 'porte', version: VERSION })
  const closed = new Promise<void>((resolve) => {
    deps.transport.onclose = resolve
  })
  await server.connect(deps.transport)
  await deps.installHook()

  const stop = new AbortController()
  const loop = superviseConnection(deps, stop.signal)

  await closed
  stop.abort()
  await loop
}

/** Hold the lock and the Host while the sticky choice says on; let both go when it says off. */
async function superviseConnection(deps: McpDaemonDeps, signal: AbortSignal): Promise<void> {
  let held: Held | null = null

  while (!signal.aborted) {
    // A Host that stopped on its own (a crash) frees the slot; the next poll retries.
    if (held?.settled()) held = null
    // oxlint-disable-next-line no-await-in-loop -- The loop reacts to one read at a time by design.
    const wanted = await shouldConnect(deps)
    if (wanted && held === null) {
      // oxlint-disable-next-line no-await-in-loop -- Election must finish before the next poll.
      held = await tryConnect(deps)
    }
    if (!wanted && held !== null) {
      held.abort.abort()
      // oxlint-disable-next-line no-await-in-loop -- The Host must stop before the lock is released.
      await held.done
      held = null
    }
    // oxlint-disable-next-line no-await-in-loop -- This is the poll cadence.
    await deps.sleep(deps.pollMs)
  }

  if (held !== null) {
    held.abort.abort()
    await held.done
  }
}

async function shouldConnect(deps: McpDaemonDeps): Promise<boolean> {
  const settings = await deps.settings.read()
  if (!settings.enabled) return false
  return (await deps.credentials.read()) !== null
}

/** One held connection: its stop switch, its end, and whether it already ended. */
type Held = {
  readonly abort: AbortController
  readonly done: Promise<void>
  readonly settled: () => boolean
}

/** Race for the lock; the winner runs the Host and publishes the state. */
async function tryConnect(deps: McpDaemonDeps): Promise<Held | null> {
  const acquired = await deps.lock.acquire()
  if (acquired.type === 'held-elsewhere') return null

  const abort = new AbortController()
  let ended = false
  // One queue orders every state write, so a late 'on' can never land after 'off'.
  let stateQueue: Promise<void> = Promise.resolve()
  const queueStateWrite = (
    state: Parameters<McpDaemonDeps['state']['write']>[0],
  ): Promise<void> => {
    stateQueue = stateQueue.then(() => deps.state.write(state)).catch(() => undefined)
    return stateQueue
  }

  const done = (async () => {
    try {
      const started = await deps.createRuntime(abort.signal)
      await started.runtime.run((relay) => {
        if (relay.type === 'connected') {
          void queueStateWrite({ status: 'on', url: started.relayUrl, pid: process.pid })
        }
      })
    } catch {
      // The daemon must survive a Host that fails; the loop retries next poll.
    }
    await queueStateWrite({ status: 'off' })
    try {
      await deps.lock.release()
    } catch {
      // A release that fails leaves a stale pid, which the next acquire steals.
    }
    ended = true
  })()
  return { abort, done, settled: () => ended }
}
