import type { HostConfig } from '@host/entrypoints/cli/host-config.ts'
import { runHostLifespan } from '@host/host-lifespan.ts'

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
    await runHostLifespan({
      config: input.config,
      signal: shutdown.signal,
    })
  } finally {
    shutdown.abort()
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}
