import type { PorteRelayObserver } from '../adapters/websocket/websocket-porte-relay.ts'

/** Writes host relay lifecycle events when verbose output is active. */
export class CliRelayObserver implements PorteRelayObserver {
  constructor(
    private readonly stderr: NodeJS.WritableStream,
    private readonly verbose: boolean,
  ) {}

  /** Write the connected event. */
  connected(): void {
    if (this.verbose) this.stderr.write('host connected\n')
  }

  /** Write the reconnect delay. */
  reconnecting(delayMs: number): void {
    if (this.verbose) this.stderr.write(`host reconnecting in ${String(delayMs)}ms\n`)
  }
}
