import type { CredentialStore, StoredCredential } from '@host/application/ports/credential-store.ts'
import type { MachineLock } from '@host/application/ports/machine-lock.ts'
import type { RelayStatus } from '@host/application/ports/relay-status.ts'
import type {
  RcSettings,
  RcSettingsRead,
  RcState,
  RcStateSnapshot,
} from '@host/application/ports/remote-control-store.ts'
import { VERSION } from '@host/entrypoints/cli/version.ts'
import { classifyHostStop, type HostStopDecision } from '@host/entrypoints/mcp/host-failure.ts'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { createLogger } from '@porte/core/client'

const logger = createLogger('mcp-daemon')

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
  /** How long after a protocol close the next Host starts. */
  readonly protocolRestartMs: number
  readonly now: () => number
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

/** A relay that closes for malformed frames this many times in a row is version skew. */
const PROTOCOL_STOPS_BEFORE_ERROR = 3

/**
 * Hold the lock and the Host while the sticky choice says on; let both go when it says off.
 *
 * A Host that stops on its own decides the next start: at once, after a delay,
 * or only once the person has changed the settings or the credential.
 */
async function superviseConnection(deps: McpDaemonDeps, signal: AbortSignal): Promise<void> {
  let held: Held | null = null
  let hold: Hold = { type: 'none' }
  let protocolStops = 0

  while (!signal.aborted) {
    // oxlint-disable-next-line no-await-in-loop -- The loop reacts to one read at a time by design.
    const wanted = await readWanted(deps)
    if (held?.outcome !== undefined) {
      const outcome = held.outcome
      protocolStops = outcome.retry === 'after-delay' && !held.connected ? protocolStops + 1 : 0
      held = null
      if (protocolStops >= PROTOCOL_STOPS_BEFORE_ERROR) {
        const failure = { type: 'protocol' } as const
        // oxlint-disable-next-line no-await-in-loop -- The Host's own writes are done; this one is the loop's.
        await deps.state.write({ status: 'error', pid: process.pid, failure })
        hold = holdFor({ retry: 'wait-for-change', failure }, wanted, deps)
      } else {
        hold = holdFor(outcome, wanted, deps)
      }
    }
    hold = releaseHold(hold, wanted, deps.now())
    if (wanted !== null && held === null && hold.type === 'none') {
      // oxlint-disable-next-line no-await-in-loop -- Election must finish before the next poll.
      held = await tryConnect(deps)
    }
    if (wanted === null && held !== null) {
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
  // A Host that stopped on its own left `connecting` or `error`; the session is over now.
  await deps.state.write({ status: 'off' })
}

/** The two files a connect needs, or null while either says no. */
type Wanted = { readonly settings: RcSettingsRead; readonly credential: StoredCredential }

async function readWanted(deps: McpDaemonDeps): Promise<Wanted | null> {
  const settings = await deps.settings.read()
  if (!settings.enabled) return null
  const credential = await deps.credentials.read()
  return credential === null ? null : { settings, credential }
}

/** What must pass before the next start: time, or a write by the person. */
type Hold =
  | { readonly type: 'none' }
  | { readonly type: 'until'; readonly at: number }
  | { readonly type: 'change'; readonly generation: number; readonly token: string }

function holdFor(outcome: HostStopDecision, wanted: Wanted | null, deps: McpDaemonDeps): Hold {
  switch (outcome.retry) {
    case 'next-poll':
      return { type: 'none' }
    case 'after-delay':
      return { type: 'until', at: deps.now() + deps.protocolRestartMs }
    case 'wait-for-change':
      // Nothing to wait on when the person already turned it off or unpaired.
      if (wanted === null) return { type: 'none' }
      return {
        type: 'change',
        generation: wanted.settings.generation,
        token: wanted.credential.token,
      }
  }
}

function releaseHold(hold: Hold, wanted: Wanted | null, now: number): Hold {
  switch (hold.type) {
    case 'none':
      return hold
    case 'until':
      return now < hold.at ? hold : { type: 'none' }
    case 'change': {
      if (wanted === null) return { type: 'none' }
      const same =
        wanted.settings.generation === hold.generation && wanted.credential.token === hold.token
      return same ? hold : { type: 'none' }
    }
  }
}

/** Off when the daemon stopped it; error when the person must act; connecting when a restart is due. */
function stateAfterStop(outcome: HostStopDecision | undefined): RcStateSnapshot {
  if (outcome === undefined) return { status: 'off' }
  if (outcome.retry === 'wait-for-change') {
    return { status: 'error', pid: process.pid, failure: outcome.failure }
  }
  return { status: 'connecting', pid: process.pid }
}

/** One held connection: its stop switch, its end, and how it ended. */
type Held = {
  readonly abort: AbortController
  readonly done: Promise<void>
  /** True once the relay accepted this Host at least once. */
  connected: boolean
  /** Set when the Host ended on its own; stays undefined while it runs or when the daemon stopped it. */
  outcome: HostStopDecision | undefined
}

/** Race for the lock; the winner runs the Host and publishes the state. */
async function tryConnect(deps: McpDaemonDeps): Promise<Held | null> {
  const acquired = await deps.lock.acquire()
  if (acquired.type === 'held-elsewhere') return null

  const abort = new AbortController()
  // One queue orders every state write, so a late 'on' can never land after 'off'.
  let stateQueue: Promise<void> = Promise.resolve()
  const queueStateWrite = (
    state: Parameters<McpDaemonDeps['state']['write']>[0],
  ): Promise<void> => {
    stateQueue = stateQueue.then(() => deps.state.write(state)).catch(() => undefined)
    return stateQueue
  }

  const ended = Promise.withResolvers<void>()
  const held: Held = { abort, done: ended.promise, connected: false, outcome: undefined }
  void (async () => {
    let outcome: HostStopDecision | undefined
    try {
      const started = await deps.createRuntime(abort.signal)
      await started.runtime.run((relay) => {
        // A first connect and a retry read the same to the person: not up yet.
        if (relay.type === 'connected') {
          held.connected = true
          void queueStateWrite({ status: 'on', url: started.relayUrl, pid: process.pid })
        } else {
          void queueStateWrite({ status: 'connecting', pid: process.pid })
        }
      })
    } catch (cause) {
      // The daemon outlives a Host that fails; the loop decides when the next one starts.
      outcome = classifyHostStop(cause)
      logger.error('host_stopped', { error: cause, details: { retry: outcome.retry } })
    }
    await queueStateWrite(stateAfterStop(outcome))
    try {
      await deps.lock.release()
    } catch {
      // A release that fails leaves a stale pid, which the next acquire steals.
    }
    held.outcome = outcome
    ended.resolve()
  })()
  return held
}
