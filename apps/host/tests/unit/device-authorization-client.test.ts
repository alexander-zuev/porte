import { PairingError } from '@host/application/errors/pairing-errors.ts'
import { DeviceAuthorizationClient } from '@host/infrastructure/porte/device-authorization-client.ts'
import { HOST_PAIRING_PATH } from '@porte/core/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const client = new DeviceAuthorizationClient('https://useporte.dev')

function serverAnswering(status: number) {
  const fetchSpy = vi.fn((_url: URL, _init: RequestInit) =>
    Promise.resolve(new Response(null, { status })),
  )
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DeviceAuthorizationClient.revoke', () => {
  it('deletes the pairing with the bearer token', async () => {
    const fetchSpy = serverAnswering(204)
    await client.revoke('secret')
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url.pathname).toBe(HOST_PAIRING_PATH)
    expect(init.method).toBe('DELETE')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret')
  })

  it('treats a refused token as already unpaired', async () => {
    serverAnswering(401)
    await expect(client.revoke('secret')).resolves.toBeUndefined()
  })

  it('keeps an unexpected answer an error', async () => {
    serverAnswering(500)
    await expect(client.revoke('secret')).rejects.toMatchObject({ reason: 'unexpected' })
  })

  it('reports an unreachable server as transient', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')))
    await expect(client.revoke('secret')).rejects.toBeInstanceOf(PairingError)
    await expect(client.revoke('secret')).rejects.toMatchObject({ reason: 'unreachable' })
  })
})
