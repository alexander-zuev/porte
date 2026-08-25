import { createOutput } from '@host/entrypoints/cli/output.ts'
import { createPairingResources } from '@host/infrastructure/bootstrap/pairing-resources.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'

/** Revoke and remove this machine's stored credential. */
export async function runUnpairCommand(input: {
  readonly config: HostConfig
  readonly stderr: NodeJS.WritableStream
}): Promise<number> {
  const resources = createPairingResources(input.config)
  const output = createOutput(input.stderr)
  const stored = await resources.credentials.read()
  if (stored === null) {
    output.done('This Mac is not paired.')
    return 0
  }

  await resources.authorizer.revoke(stored.token)
  await resources.credentials.clear()

  output.done(`Unpaired this Mac from ${output.emphasis.strong(new URL(stored.baseUrl).host)}`)
  return 0
}
