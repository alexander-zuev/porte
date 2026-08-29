import type { RelayStatusListener } from '@host/application/ports/relay-status.ts'
import { createCommand } from '@host/domain/messages/types.ts'
import type { AppDeps } from '@host/infrastructure/app-deps.ts'

/** Owns the active resources for one Host process. */
export class HostRuntime {
  constructor(
    private readonly signal: AbortSignal,
    private readonly deps: Pick<AppDeps, 'connections' | 'bus' | 'background'>,
  ) {}

  /** Open the control connection and wait for shutdown. */
  async run(onStatus?: RelayStatusListener): Promise<void> {
    if (this.signal.aborted) return
    try {
      this.deps.connections.connectControl(onStatus)
      await waitForStop(this.signal, this.deps.connections.controlStopped)
    } finally {
      await this.shutdown()
    }
  }

  /** Close conversations and the agent, let in-flight turns settle, then drop the sockets. */
  async shutdown(): Promise<void> {
    try {
      await this.deps.bus.handle(createCommand('CloseAllConversations', {}))
      await this.deps.background.drain()
    } finally {
      this.deps.connections.closeAll()
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
