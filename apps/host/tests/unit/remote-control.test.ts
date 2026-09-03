import {
  status,
  toggle,
  unpair,
  type RemoteControlDeps,
} from '@host/application/commands/remote-control.ts'
import type { CredentialStore, StoredCredential } from '@host/application/ports/credential-store.ts'
import type { DeviceAuthorizer } from '@host/application/ports/device-authorizer.ts'
import type {
  PairingWatcher,
  RcPairingStore,
  RcSettings,
  RcState,
  RcStateSnapshot,
} from '@host/application/ports/remote-control-store.ts'
import { describe, expect, it } from 'vitest'

const PAIRED: StoredCredential = { baseUrl: 'https://useporte.dev', token: 'session-token' }

function fakeDeps(overrides?: {
  credential?: StoredCredential | null
  enabled?: boolean
  state?: RcStateSnapshot
  stateAfterEnable?: RcStateSnapshot
}) {
  let credential = overrides?.credential ?? null
  let settings = { enabled: overrides?.enabled ?? false, hook: false, generation: 0 }
  let state = overrides?.state ?? ({ status: 'off' } as const)
  let pending: ReturnType<RcPairingStore['read']> extends Promise<infer T> ? T : never = null
  const revoked: string[] = []
  const watched: string[] = []

  const credentials: CredentialStore = {
    read: () => Promise.resolve(credential),
    write: (value) => {
      credential = value
      return Promise.resolve()
    },
    clear: () => {
      credential = null
      return Promise.resolve()
    },
  }
  const authorizer: DeviceAuthorizer = {
    requestCode: () =>
      Promise.resolve({
        deviceCode: 'device-secret',
        userCode: 'ABC123',
        verificationUri: 'https://useporte.dev/pair',
        verificationUriComplete: 'https://useporte.dev/pair?code=ABC123',
        intervalSeconds: 3,
        expiresInSeconds: 600,
      }),
    poll: () => Promise.resolve({ status: 'pending' }),
    revoke: (token) => {
      revoked.push(token)
      return Promise.resolve()
    },
    accountOf: () => Promise.resolve(null),
  }
  const deps: RemoteControlDeps = {
    authorizer,
    credentials,
    settings: {
      read: () => Promise.resolve(settings),
      write: (value) => {
        settings = { ...value, generation: settings.generation + 1 }
        // The daemon reacting to the flip is simulated by the test scenario.
        if (value.enabled && overrides?.stateAfterEnable) state = overrides.stateAfterEnable
        return Promise.resolve()
      },
    } satisfies RcSettings,
    state: {
      read: () => Promise.resolve(state),
      write: (value) => {
        state = value
        return Promise.resolve()
      },
    } satisfies RcState,
    pairing: {
      read: () => Promise.resolve(pending),
      write: (value) => {
        pending = value
        return Promise.resolve()
      },
      clear: () => {
        pending = null
        return Promise.resolve()
      },
    } satisfies RcPairingStore,
    watcher: {
      start: (grant) => {
        watched.push(grant.deviceCode)
      },
    } satisfies PairingWatcher,
    baseUrl: 'https://useporte.dev',
    host: { name: 'a-mac', platform: 'darwin' },
    now: () => currentMs,
    sleep: (ms) => {
      currentMs += ms
      return Promise.resolve()
    },
    confirmTimeoutMs: 10_000,
  }
  let currentMs = 1_000
  return {
    deps,
    advance: (ms: number) => {
      currentMs += ms
    },
    revoked: () => revoked,
    watched: () => watched,
    settings: () => ({ enabled: settings.enabled, hook: settings.hook }),
    generation: () => settings.generation,
    pending: () => pending,
    credential: () => credential,
  }
}

describe('toggle', () => {
  it('starts pairing with a one-tap link when the machine is not paired', async () => {
    const test = fakeDeps()

    const result = await toggle(test.deps)

    expect(result).toEqual({
      type: 'pairing-started',
      verificationUriComplete: 'https://useporte.dev/pair?code=ABC123',
      userCode: 'ABC123',
    })
    expect(test.watched()).toEqual(['device-secret'])
    expect(test.pending()).not.toBeNull()
  })

  it('repeats the same link while an approval is still pending', async () => {
    const test = fakeDeps()
    await toggle(test.deps)

    const result = await toggle(test.deps)

    expect(result).toEqual({
      type: 'pairing-pending',
      verificationUriComplete: 'https://useporte.dev/pair?code=ABC123',
      userCode: 'ABC123',
    })
    // No second code was requested.
    expect(test.watched()).toEqual(['device-secret'])
  })

  it('starts over with a fresh code once the pending grant expired', async () => {
    const test = fakeDeps()
    await toggle(test.deps)
    test.advance(600 * 1000 + 1)

    const result = await toggle(test.deps)

    expect(result.type).toBe('pairing-started')
    expect(test.watched()).toHaveLength(2)
  })

  it('enables and reports connected once the daemon confirms', async () => {
    const test = fakeDeps({
      credential: PAIRED,
      stateAfterEnable: { status: 'on', url: 'https://useporte.dev', pid: 42 },
    })

    const result = await toggle(test.deps)

    expect(result).toEqual({ type: 'connected', url: 'https://useporte.dev' })
    expect(test.settings()).toEqual({ enabled: true, hook: false })
  })

  it('reports connecting when no daemon confirms within the window', async () => {
    const test = fakeDeps({ credential: PAIRED })

    const result = await toggle(test.deps)

    expect(result).toEqual({ type: 'connecting', url: 'https://useporte.dev' })
    expect(test.settings()).toEqual({ enabled: true, hook: false })
  })

  it('on a revoked pairing, drops the dead credential and starts pairing again', async () => {
    const test = fakeDeps({
      credential: PAIRED,
      enabled: true,
      state: { status: 'error', pid: 1, failure: { type: 'unauthorized', http: 403 } },
    })

    const result = await toggle(test.deps)

    expect(result.type).toBe('pairing-started')
    expect(test.credential()).toBeNull()
    expect(test.watched()).toEqual(['device-secret'])
  })

  it('on any other error, writes the settings again so the daemon retries', async () => {
    const test = fakeDeps({
      credential: PAIRED,
      enabled: true,
      state: { status: 'error', pid: 1, failure: { type: 'refused', http: 426 } },
      stateAfterEnable: { status: 'on', url: 'https://useporte.dev', pid: 1 },
    })

    const result = await toggle(test.deps)

    expect(result).toEqual({ type: 'connected', url: 'https://useporte.dev' })
    expect(test.settings()).toEqual({ enabled: true, hook: false })
    expect(test.generation()).toBe(1)
  })

  it('disables while on', async () => {
    const test = fakeDeps({
      credential: PAIRED,
      enabled: true,
      state: { status: 'on', url: 'https://useporte.dev', pid: 42 },
    })

    const result = await toggle(test.deps)

    expect(result).toEqual({ type: 'disconnected' })
    expect(test.settings()).toEqual({ enabled: false, hook: false })
  })
})

describe('status', () => {
  it('reports not paired', async () => {
    const test = fakeDeps()
    expect(await status(test.deps)).toEqual({ type: 'not-paired' })
  })

  it('reports on with the url', async () => {
    const test = fakeDeps({
      credential: PAIRED,
      state: { status: 'on', url: 'https://useporte.dev', pid: 42 },
    })
    expect(await status(test.deps)).toEqual({ type: 'on', url: 'https://useporte.dev' })
  })

  it('reports connecting while the daemon has no socket up', async () => {
    const test = fakeDeps({ credential: PAIRED, state: { status: 'connecting', pid: 1 } })
    expect(await status(test.deps)).toEqual({ type: 'connecting' })
  })

  it('reports the failure the daemon stopped on', async () => {
    const failure = { type: 'agent-start' } as const
    const test = fakeDeps({ credential: PAIRED, state: { status: 'error', pid: 1, failure } })
    expect(await status(test.deps)).toEqual({ type: 'error', failure })
  })

  it('reports off with the host name', async () => {
    const test = fakeDeps({ credential: PAIRED })
    expect(await status(test.deps)).toEqual({ type: 'off', hostName: 'a-mac' })
  })
})

describe('unpair', () => {
  it('disables, revokes, and deletes the credential', async () => {
    const test = fakeDeps({
      credential: PAIRED,
      enabled: true,
      state: { status: 'on', url: 'https://useporte.dev', pid: 42 },
    })

    const result = await unpair(test.deps)

    expect(result).toEqual({ type: 'unpaired' })
    expect(test.revoked()).toEqual(['session-token'])
    expect(test.credential()).toBeNull()
    expect(test.settings()).toEqual({ enabled: false, hook: false })
  })

  it('reports an unpaired machine as already unpaired', async () => {
    const test = fakeDeps()
    expect(await unpair(test.deps)).toEqual({ type: 'not-paired' })
    expect(test.revoked()).toEqual([])
  })
})
