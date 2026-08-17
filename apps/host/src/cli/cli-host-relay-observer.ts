import type { HostRelayObserver } from '../host/host-relay.ts'

/** Writes host relay lifecycle events when verbose output is active. */
export class CliHostRelayObserver implements HostRelayObserver {
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
