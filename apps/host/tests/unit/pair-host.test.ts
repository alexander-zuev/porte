import { pairHost } from '@host/application/commands/pair-host.ts'
import {
  CredentialStoreError,
  type CredentialStore,
  type StoredCredential,
} from '@host/application/ports/credential-store.ts'
import type {
  DeviceAuthorizer,
  DeviceCodeGrant,
  DevicePollResult,
} from '@host/application/ports/device-authorizer.ts'
import { describe, expect, it } from 'vitest'

const GRANT: DeviceCodeGrant = {
  deviceCode: 'device-secret',
  userCode: 'ABC123',
  verificationUri: 'https://useporte.dev/pair',
  verificationUriComplete: 'https://useporte.dev/pair?code=ABC123',
  intervalSeconds: 3,
  expiresInSeconds: 600,
}

/** Answers a scripted sequence of polls, so a test states the server's story. */
function authorizerReturning(
  polls: DevicePollResult[],
): DeviceAuthorizer & { pollCount: () => number } {
  let index = 0
  return {
    pollCount: () => index,
    requestCode: () => Promise.resolve(GRANT),
    poll: () => Promise.resolve(polls[index++] ?? { status: 'pending' }),
    revoke: () => Promise.resolve(),
    accountOf: () => Promise.resolve('someone@example.com'),
  }
}

function credentialSpy(): CredentialStore & { written: () => StoredCredential | null } {
  let saved: StoredCredential | null = null
  return {
    written: () => saved,
    read: () => Promise.resolve(saved),
    write: (credential) => {
      saved = credential
      return Promise.resolve()
    },
    clear: () => Promise.resolve(),
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
  onPoll?: Parameters<typeof pairHost>[0]['onPoll'],
) {
  const clock = fakeClock()
  return pairHost({
    authorizer,
    credentials,
    baseUrl: 'https://useporte.dev',
    host: { name: 'a-mac', platform: 'darwin' },
    onPrompt,
    onPoll,
    sleep: clock.sleep,
    now: clock.now,
  })
}

describe('pairHost', () => {
  it('reports each unanswered poll, not the one that answers', async () => {
    const polls: number[] = []
    const authorizer = authorizerReturning([
      { status: 'pending' },
      { status: 'pending' },
      { status: 'granted', token: 'session-token' },
    ])

    await pair(
      authorizer,
      credentialSpy(),
      () => {},
      (poll) => polls.push(poll.attempt),
    )

    expect(polls).toEqual([1, 2])
  })

  it('stores the token once the person approves', async () => {
    const credentials = credentialSpy()
    const authorizer = authorizerReturning([
      { status: 'pending' },
      { status: 'granted', token: 'session-token' },
    ])

    const result = await pair(authorizer, credentials)

    expect(result).toEqual({ status: 'paired', account: 'someone@example.com' })
    expect(credentials.written()).toEqual({
      baseUrl: 'https://useporte.dev',
      token: 'session-token',
    })
  })

  it('shows the code before waiting, so the person can act', async () => {
    let prompted: string | undefined
    const authorizer = authorizerReturning([{ status: 'granted', token: 't' }])

    await pair(authorizer, credentialSpy(), (prompt) => {
      prompted = prompt.userCode
    })

    expect(prompted).toBe('ABC123')
  })

  it('keeps polling while approval is pending', async () => {
    const authorizer = authorizerReturning([
      { status: 'pending' },
      { status: 'pending' },
      { status: 'granted', token: 't' },
    ])

    await pair(authorizer, credentialSpy())

    expect(authorizer.pollCount()).toBe(3)
  })

  it('backs off when the server says to slow down', async () => {
    const authorizer = authorizerReturning([
      { status: 'slow-down', intervalSeconds: 5 },
      { status: 'granted', token: 't' },
    ])

    const result = await pair(authorizer, credentialSpy())

    expect(result.status).toBe('paired')
  })

  it('stores nothing when the person declines', async () => {
    const credentials = credentialSpy()
    const authorizer = authorizerReturning([{ status: 'denied' }])

    const result = await pair(authorizer, credentials)

    expect(result).toEqual({ status: 'denied' })
    expect(credentials.written()).toBeNull()
  })

  it('gives up once the code outlives its expiry', async () => {
    // Never granted: the loop must end on the deadline rather than run forever.
    const authorizer = authorizerReturning([])

    const result = await pair(authorizer, credentialSpy())

    expect(result).toEqual({ status: 'expired' })
  })

  it('reports a credential that cannot be written', async () => {
    const authorizer = authorizerReturning([{ status: 'granted', token: 't' }])
    const credentials: CredentialStore = {
      ...credentialSpy(),
      write: () => Promise.reject(new CredentialStoreError({ cause: 'read-only' })),
    }

    await expect(pair(authorizer, credentials)).rejects.toThrow(CredentialStoreError)
  })
})
