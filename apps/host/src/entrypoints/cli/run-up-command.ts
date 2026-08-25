import { createHostRuntime } from '@host/infrastructure/bootstrap/host-runtime.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'

export type RunUpCommandInput = {
  readonly config: HostConfig
}

/** Run the Host until the process receives a shutdown signal. */
export async function runUpCommand(input: RunUpCommandInput): Promise<void> {
  const shutdown = new AbortController()
  const stop = (): void => {
    shutdown.abort()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  try {
    const runtime = await createHostRuntime(input.config, shutdown.signal)
    await runtime.run()
  } finally {
    shutdown.abort()
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}
