import type { RelayStatus } from '@host/application/ports/relay-status.ts'
import { createOutput, type Output } from '@host/entrypoints/cli/output.ts'
import { createHostRuntime } from '@host/infrastructure/bootstrap/host-runtime.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'

export type RunUpCommandInput = {
  readonly config: HostConfig
  readonly stderr: NodeJS.WritableStream
}

/** Run the Host until the process receives a shutdown signal. */
export async function runUpCommand(input: RunUpCommandInput): Promise<void> {
  const output = createOutput(input.stderr)
  const shutdown = new AbortController()
  const stop = (): void => {
    shutdown.abort()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  try {
    const { runtime, relayUrl } = await createHostRuntime(input.config, shutdown.signal)
    await runtime.run(reportRelayStatus(output, relayUrl))
    if (shutdown.signal.aborted) output.done('Stopped.')
  } finally {
    shutdown.abort()
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}

/**
 * Turn socket states into the lines a person watches. A drop is one line that
 * rewrites itself on each retry; a terminal failure never reaches here, the
 * CLI error boundary prints it.
 */
export function reportRelayStatus(output: Output, baseUrl: string): (status: RelayStatus) => void {
  const { url, quiet } = output.emphasis
  const site = new URL(baseUrl).host
  let wasConnected = false
  return (status) => {
    switch (status.type) {
      case 'connecting':
        output.status(quiet(`Connecting to ${site}…`))
        return
      case 'connected':
        if (wasConnected) {
          output.done('Reconnected.')
        } else {
          output.done(`Connected. Open ${url(`${baseUrl}/conversations`)}`)
          wasConnected = true
        }
        return
      case 'reconnecting':
        output.status(
          `${DROP_TEXT[status.cause]} ${quiet(`Retrying (attempt ${String(status.attempt)})…`)}`,
        )
        return
    }
  }
}

/** The relay's edge answered but Porte did not, versus nothing answered at all. */
const DROP_TEXT = {
  'server-unreachable': '! Porte is unreachable.',
  'connection-lost': '! Connection lost.',
} as const
