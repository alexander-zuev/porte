import { Result, type Result as ResultType } from 'better-result'
import { describe, expect, it } from 'vitest'

import { CredentialStoreError } from '../../src/application/host-error.ts'
import { pairHost } from '../../src/application/pair-host.ts'
import { PairingError } from '../../src/application/pairing-error.ts'
import type {
  CredentialStore,
  StoredCredential,
} from '../../src/application/ports/credential-store.ts'
import type {
  DeviceAuthorizer,
  DeviceCodeGrant,
  DevicePollResult,
} from '../../src/application/ports/device-authorizer.ts'

const GRANT: DeviceCodeGrant = {
  deviceCode: 'device-secret',
  userCode: 'ABC123',
  verificationUri: 'https://useporte.dev/pair',
  intervalSeconds: 3,
  expiresInSeconds: 600,
}

/** Answers a scripted sequence of polls, so a test states the server's story. */
function authorizerReturning(
  polls: ResultType<DevicePollResult, PairingError>[],
): DeviceAuthorizer & { pollCount: () => number } {
  let index = 0
  return {
    pollCount: () => index,
    requestCode: () => Promise.resolve(Result.ok(GRANT)),
    poll: () => Promise.resolve(polls[index++] ?? Result.ok({ status: 'pending' })),
    revoke: () => Promise.resolve(Result.ok()),
  }
}

function credentialSpy(): CredentialStore & { written: () => StoredCredential | null } {
  let saved: StoredCredential | null = null
  return {
    written: () => saved,
    read: () => Promise.resolve(Result.ok(saved)),
    write: (credential) => {
      saved = credential
      return Promise.resolve(Result.ok(undefined))
    },
    clear: () => Promise.resolve(Result.ok(undefined)),
  }
}

/** A clock the test drives, so polling costs no real time. */
function fakeClock() {
  let current = 0
  return {
    now: () => current,
    sleep: (ms: number) => {
      current += ms
      return Promise.resolve()
    },
  }
}

function pair(
  authorizer: DeviceAuthorizer,
  credentials: CredentialStore,
  onPrompt: Parameters<typeof pairHost>[0]['onPrompt'] = () => {},
) {
  const clock = fakeClock()
  return pairHost({
    authorizer,
    credentials,
    baseUrl: 'https://useporte.dev',
    onPrompt,
    sleep: clock.sleep,
    now: clock.now,
  })
}

describe('pairHost', () => {
  it('stores the token once the person approves', async () => {
    const credentials = credentialSpy()
    const authorizer = authorizerReturning([
      Result.ok({ status: 'pending' }),
      Result.ok({ status: 'granted', token: 'session-token' }),
    ])

    const result = await pair(authorizer, credentials)

    expect(result.isOk()).toBe(true)
    expect(credentials.written()).toEqual({
      baseUrl: 'https://useporte.dev',
      token: 'session-token',
    })
  })

  it('shows the code before waiting, so the person can act', async () => {
    let prompted: string | undefined
    const authorizer = authorizerReturning([Result.ok({ status: 'granted', token: 't' })])

    await pair(authorizer, credentialSpy(), (prompt) => {
      prompted = prompt.userCode
    })

    expect(prompted).toBe('ABC123')
  })

  it('keeps polling while approval is pending', async () => {
    const authorizer = authorizerReturning([
      Result.ok({ status: 'pending' }),
      Result.ok({ status: 'pending' }),
      Result.ok({ status: 'granted', token: 't' }),
    ])

    await pair(authorizer, credentialSpy())

    expect(authorizer.pollCount()).toBe(3)
  })

  it('backs off when the server says to slow down', async () => {
    const authorizer = authorizerReturning([
      Result.ok({ status: 'slow-down', intervalSeconds: 5 }),
      Result.ok({ status: 'granted', token: 't' }),
    ])

    const result = await pair(authorizer, credentialSpy())

    expect(result.isOk()).toBe(true)
  })

  it('stores nothing when the person declines', async () => {
    const credentials = credentialSpy()
    const authorizer = authorizerReturning([Result.err(new PairingError({ reason: 'denied' }))])

    const result = await pair(authorizer, credentials)

    expect(result.isErr()).toBe(true)
    expect(credentials.written()).toBeNull()
  })

  it('gives up once the code outlives its expiry', async () => {
    // Never granted: the loop must end on the deadline rather than run forever.
    const authorizer = authorizerReturning([])

    const result = await pair(authorizer, credentialSpy())

    expect(result.isErr()).toBe(true)
    if (result.isErr()) expect(result.error).toBeInstanceOf(PairingError)
  })

  it('reports a credential that cannot be written', async () => {
    const authorizer = authorizerReturning([Result.ok({ status: 'granted', token: 't' })])
    const credentials: CredentialStore = {
      ...credentialSpy(),
      write: () => Promise.resolve(Result.err(new CredentialStoreError({ cause: 'read-only' }))),
    }

    const result = await pair(authorizer, credentials)

    expect(result.isErr()).toBe(true)
  })
})
