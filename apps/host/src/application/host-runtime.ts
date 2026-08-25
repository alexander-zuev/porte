import type { HostConnections } from '@host/application/ports/host-connections.ts'
import type { SessionSupervisor } from '@host/application/session-supervisor.ts'

/** Owns the active resources for one Host process. */
export class HostRuntime {
  constructor(
    private readonly signal: AbortSignal,
    private readonly connections: Pick<
      HostConnections,
      'connectControl' | 'controlStopped' | 'closeAll'
    >,
    private readonly sessions: Pick<SessionSupervisor, 'closeAll'>,
  ) {}

  /** Open the control connection and wait for shutdown. */
  async run(): Promise<void> {
    if (this.signal.aborted) return
    try {
      this.connections.connectControl()
      await waitForStop(this.signal, this.connections.controlStopped)
    } finally {
      await this.shutdown()
    }
  }

  /** Close agent sessions before the control connection. */
  async shutdown(): Promise<void> {
    try {
      await this.sessions.closeAll()
    } finally {
      await this.connections.closeAll()
    }
  }
}

function waitForStop(signal: AbortSignal, controlStopped: Promise<void>): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const stop = (): void => {
      resolve()
    }
    signal.addEventListener('abort', stop, { once: true })
    void controlStopped.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', stop)
    })
  })
}
