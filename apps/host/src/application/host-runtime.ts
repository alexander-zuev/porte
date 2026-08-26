import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import type { HostConnections } from '@host/application/ports/host-connections.ts'

/** Owns the active resources for one Host process. */
export class HostRuntime {
  constructor(
    private readonly signal: AbortSignal,
    private readonly connections: Pick<
      HostConnections,
      'connectControl' | 'controlStopped' | 'closeAll'
    >,
    private readonly codingAgent: Pick<CodingAgent, 'closeAll'>,
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

  /** Close ACP sessions before the control connection. */
  async shutdown(): Promise<void> {
    try {
      await this.codingAgent.closeAll()
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
