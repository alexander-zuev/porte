import type { CredentialStore } from '@host/application/ports/credential-store.ts'
import type { DeviceAuthorizer } from '@host/application/ports/device-authorizer.ts'
import type {
  PairingWatcher,
  RcPairingStore,
  RcSettings,
  RcState,
} from '@host/application/ports/remote-control-store.ts'
import type { HostDescriptor } from '@porte/core/client'

/** How one `/remote-control` toggle ended. Each variant is one line the person reads. */
export type RcToggleResult =
  /** A fresh code was issued; the watcher now waits for the phone tap. */
  | {
      readonly type: 'pairing-started'
      readonly verificationUriComplete: string
      readonly userCode: string
    }
  /** An earlier code is still valid and unanswered. */
  | {
      readonly type: 'pairing-pending'
      readonly verificationUriComplete: string
      readonly userCode: string
    }
  | { readonly type: 'connected'; readonly url: string }
  /** Enabled, but no daemon confirmed within the window. */
  | { readonly type: 'connecting'; readonly url: string }
  | { readonly type: 'disconnected' }

/** What `/remote-control status` reports. */
export type RcStatusResult =
  | { readonly type: 'on'; readonly url: string }
  | { readonly type: 'off'; readonly hostName: string }
  | { readonly type: 'not-paired' }

/** What `/remote-control unpair` reports. */
export type RcUnpairResult = { readonly type: 'unpaired' } | { readonly type: 'not-paired' }

/** Everything the remote-control verbs read and write. */
export type RemoteControlDeps = {
  readonly authorizer: DeviceAuthorizer
  readonly credentials: CredentialStore
  readonly settings: RcSettings
  readonly state: RcState
  readonly pairing: RcPairingStore
  readonly watcher: PairingWatcher
  readonly baseUrl: string
  readonly host: HostDescriptor
  readonly now: () => number
  readonly sleep: (ms: number) => Promise<void>
  /** How long toggle waits for a daemon to confirm the connection. */
  readonly confirmTimeoutMs: number
}

/** How often toggle re-reads the state while waiting for a daemon to confirm. */
const CONFIRM_POLL_MS = 500

/**
 * Flip remote control.
 *
 * Unpaired: issue a code, hand it to the watcher, and return the link at once —
 * approval lands later and a daemon connects on its own. Paired: flip the
 * sticky choice; the daemons react to it.
 */
export async function toggle(deps: RemoteControlDeps): Promise<RcToggleResult> {
  const credential = await deps.credentials.read()
  if (credential === null) return startOrRepeatPairing(deps)

  const settings = await deps.settings.read()
  if (settings.enabled) {
    await deps.settings.write({ ...settings, enabled: false })
    return { type: 'disconnected' }
  }

  await deps.settings.write({ ...settings, enabled: true })
  const confirmed = await waitForOn(deps)
  return confirmed ?? { type: 'connecting', url: credential.baseUrl }
}

/** Report the live connection fact without changing anything. */
export async function status(deps: RemoteControlDeps): Promise<RcStatusResult> {
  const credential = await deps.credentials.read()
  if (credential === null) return { type: 'not-paired' }

  const state = await deps.state.read()
  if (state.status === 'on') return { type: 'on', url: state.url }
  return { type: 'off', hostName: deps.host.name }
}

/** Disable, revoke the credential with the server, and delete it locally. */
export async function unpair(deps: RemoteControlDeps): Promise<RcUnpairResult> {
  const credential = await deps.credentials.read()
  if (credential === null) return { type: 'not-paired' }

  await deps.settings.write({ ...(await deps.settings.read()), enabled: false })
  await deps.pairing.clear()
  await deps.authorizer.revoke(credential.token)
  await deps.credentials.clear()
  return { type: 'unpaired' }
}

/** Turn the instant prompt hook on or off; the caller installs or removes the files. */
export async function setHook(deps: RemoteControlDeps, hook: boolean): Promise<void> {
  await deps.settings.write({ ...(await deps.settings.read()), hook })
}

/** Reuse a live pending code, or issue a fresh one and start its watcher. */
async function startOrRepeatPairing(deps: RemoteControlDeps): Promise<RcToggleResult> {
  const pending = await deps.pairing.read()
  if (pending !== null && pending.expiresAtMs > deps.now()) {
    return {
      type: 'pairing-pending',
      verificationUriComplete: pending.verificationUriComplete,
      userCode: pending.userCode,
    }
  }

  const grant = await deps.authorizer.requestCode(deps.host)
  await deps.pairing.write({
    deviceCode: grant.deviceCode,
    userCode: grant.userCode,
    verificationUriComplete: grant.verificationUriComplete,
    expiresAtMs: deps.now() + grant.expiresInSeconds * 1000,
  })
  deps.watcher.start(grant)
  return {
    type: 'pairing-started',
    verificationUriComplete: grant.verificationUriComplete,
    userCode: grant.userCode,
  }
}

/** Poll the published state until a daemon reports on, or the window closes. */
async function waitForOn(deps: RemoteControlDeps): Promise<RcToggleResult | null> {
  const deadline = deps.now() + deps.confirmTimeoutMs
  while (deps.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Each read must see the previous daemon reaction.
    const state = await deps.state.read()
    if (state.status === 'on') return { type: 'connected', url: state.url }
    // oxlint-disable-next-line no-await-in-loop -- Polling is the contract; the daemon reacts within its loop.
    await deps.sleep(CONFIRM_POLL_MS)
  }
  return null
}
