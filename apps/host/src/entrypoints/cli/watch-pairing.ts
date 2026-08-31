import { completePairing } from '@host/application/commands/pair-host.ts'
import type { RemoteControlDeps } from '@host/application/commands/remote-control.ts'
import { readAllText } from '@host/infrastructure/node/read-stream.ts'
import { z } from 'zod'

/** The grant the rc toggle hands its detached watcher, verbatim. */
const GrantSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.string().min(1),
  verificationUriComplete: z.string().min(1),
  intervalSeconds: z.number(),
  expiresInSeconds: z.number(),
})

/**
 * Finish a pairing whose link was already shown.
 *
 * Runs detached from the rc invocation. Approval enables remote control, so a
 * daemon connects on its own; any other ending clears the pending pairing so
 * the next `/remote-control` starts fresh.
 */
export async function runWatchPairing(
  deps: RemoteControlDeps,
  stdin: NodeJS.ReadableStream,
): Promise<void> {
  const grant = GrantSchema.parse(JSON.parse(await readAllText(stdin)))

  const outcome = await completePairing(
    {
      authorizer: deps.authorizer,
      credentials: deps.credentials,
      baseUrl: deps.baseUrl,
      sleep: deps.sleep,
      now: deps.now,
    },
    grant,
  )

  // Clear only our own grant: a fresh toggle may have written a newer one.
  const pending = await deps.pairing.read()
  if (pending?.deviceCode === grant.deviceCode) {
    await deps.pairing.clear()
  }
  if (outcome.status === 'paired') {
    await deps.settings.write({ ...(await deps.settings.read()), enabled: true })
  }
}
