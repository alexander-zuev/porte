/** The static frame that checks whether the relay path can carry traffic. */
export const RELAY_HEARTBEAT_REQUEST = 'ping'

/** The static frame that confirms the relay path can carry traffic. */
export const RELAY_HEARTBEAT_RESPONSE = 'pong'

/** The delay between healthy relay checks. */
export const RELAY_HEARTBEAT_INTERVAL_MS = 30_000

/** The maximum wait for one relay check response. */
export const RELAY_HEARTBEAT_TIMEOUT_MS = 10_000

type Timer = ReturnType<typeof setTimeout>

type HeartbeatState =
  | { readonly status: 'stopped' }
  | { readonly status: 'ready'; readonly interval: Timer }
  | { readonly status: 'waiting'; readonly interval: Timer; readonly timeout: Timer }

/**
 * Own one relay connection's heartbeat timers.
 * It expires once when a sent check receives no response.
 */
export class RelayHeartbeat {
  private state: HeartbeatState = { status: 'stopped' }

  constructor(
    private readonly probe: () => void,
    private readonly onTimeout: () => void,
  ) {}

  /** Start checks. A repeated call keeps the current schedule. */
  start(): void {
    if (this.state.status !== 'stopped') return

    const interval = setInterval(() => {
      this.check()
    }, RELAY_HEARTBEAT_INTERVAL_MS)
    this.state = { status: 'ready', interval }
  }

  /** Confirm that the current probe received its response. */
  acknowledge(): void {
    if (this.state.status !== 'waiting') return

    clearTimeout(this.state.timeout)
    this.state = { status: 'ready', interval: this.state.interval }
  }

  /** Stop all checks. A repeated call has no effect. */
  stop(): void {
    if (this.state.status === 'stopped') return

    clearInterval(this.state.interval)
    if (this.state.status === 'waiting') clearTimeout(this.state.timeout)
    this.state = { status: 'stopped' }
  }

  private check(): void {
    if (this.state.status !== 'ready') return

    const { interval } = this.state
    const timeout = setTimeout(() => {
      this.expireIfWaiting(timeout)
    }, RELAY_HEARTBEAT_TIMEOUT_MS)
    this.state = { status: 'waiting', interval, timeout }

    try {
      this.probe()
    } catch {
      this.expireIfWaiting(timeout)
    }
  }

  private expireIfWaiting(timeout: Timer): void {
    if (this.state.status !== 'waiting' || this.state.timeout !== timeout) return

    this.stop()
    this.onTimeout()
  }
}
