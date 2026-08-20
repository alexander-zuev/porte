import { execFileSync } from 'node:child_process'
import { hostname } from 'node:os'

import { ConfigError } from '@host/application/host-error.ts'
import { HostPlatformSchema, type HostDescriptor } from '@porte/core'

/**
 * What this Mac calls itself.
 *
 * `platform` stays the runtime's own token, so what is stored is what Node
 * reported. Turning `darwin` into `macOS` is the reader's job, and spelling it
 * both ways would leave two versions of one fact.
 */
export function describeThisMachine(): HostDescriptor {
  const platform = HostPlatformSchema.safeParse(process.platform)
  if (!platform.success) {
    throw new ConfigError({ message: `Porte does not run on ${process.platform} yet.` })
  }

  return { name: machineName(), platform: platform.data }
}

/**
 * The name the person gave this machine, not the one the network uses.
 *
 * macOS keeps both: `Alexander's MacBook Pro` in settings, and a hyphenated
 * `.local` form for mDNS. The settings name is the one they will recognise on
 * the confirmation screen, so it is worth asking for.
 */
function machineName(): string {
  const configured = process.platform === 'darwin' ? computerName() : null
  return configured ?? hostname().replace(/\.local$/, '')
}

/** Null on any refusal: a machine name is never worth failing pairing over. */
function computerName(): string | null {
  try {
    const name = execFileSync('scutil', ['--get', 'ComputerName'], {
      encoding: 'utf8',
      timeout: 1000,
    }).trim()
    return name.length > 0 ? name : null
  } catch {
    return null
  }
}
