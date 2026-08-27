import { HostNotPairedError } from '@host/application/errors/pairing-errors.ts'
import { HostRuntime } from '@host/application/host-runtime.ts'
import { createAppDeps } from '@host/infrastructure/app-deps.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'
import { FileCredentialStore } from '@host/infrastructure/persistence/credential-store.ts'

/** Create one inactive Host runtime: read the pairing, build the app, start the agent. */
export async function createHostRuntime(
  config: HostConfig,
  signal: AbortSignal,
): Promise<HostRuntime> {
  const credentials = new FileCredentialStore(config.dataDirectory)
  const credential = await credentials.read()
  if (credential === null) throw new HostNotPairedError()

  const deps = await createAppDeps({ credential, signal })
  return new HostRuntime(signal, deps)
}
