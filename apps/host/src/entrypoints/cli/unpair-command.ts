import type { HostConfig } from '@host/entrypoints/cli/host-config.ts'
import { createOutput } from '@host/entrypoints/cli/output.ts'
import { createPairingResources } from '@host/infrastructure/bootstrap/pairing-resources.ts'

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

  const revoked = await resources.authorizer.revoke(stored.token)
  if (revoked.isErr()) throw revoked.error
  const cleared = await resources.credentials.clear()
  if (cleared.isErr()) throw cleared.error

  output.done(`Unpaired this Mac from ${output.emphasis.strong(new URL(stored.baseUrl).host)}`)
  return 0
}
