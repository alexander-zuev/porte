import type { RelayStatus } from '@host/application/ports/relay-status.ts'
import {
  PartySocketTransport,
  dropCause,
} from '@host/infrastructure/websocket/party-socket-transport.ts'
import { describe, expect, it } from 'vitest'

class FakePartySocket extends EventTarget {
  readonly retryCount = 0

  reconnect(): void {
    this.dispatchEvent(new Event('open'))
  }

  send(): void {}

  close(): void {}
}

describe('PartySocketTransport', () => {
  it('starts connecting without waiting for open', () => {
    const transport = new PartySocketTransport(
      {
        url: 'ws://relay.invalid',
        subprotocol: 'porte.test',
        authorization: 'Bearer test',
        cliVersion: '0.0.0',
      },
      new FakePartySocket(),
    )
    let opened = false
    transport.start({
      onFrame: async () => undefined,
      onUp: async () => {
        opened = true
      },
    })
    expect(opened).toBe(true)
    transport.stop()
  })

  it('reports connecting, connected, and each retry with its cause', () => {
    const socket = new FakePartySocket()
    const transport = new PartySocketTransport(
      {
        url: 'ws://relay.invalid',
        subprotocol: 'porte.test',
        authorization: 'Bearer test',
        cliVersion: '0.0.0',
      },
      socket,
    )
    const seen: RelayStatus[] = []
    transport.start({ onFrame: async () => undefined, onStatus: (status) => seen.push(status) })
    socket.dispatchEvent(Object.assign(new Event('close'), { code: 1006, reason: '' }))
    expect(seen).toEqual([
      { type: 'connecting' },
      { type: 'connected', attempt: 0 },
      { type: 'reconnecting', attempt: 1, cause: 'connection-lost' },
    ])
    transport.stop()
  })

  it('names a 5xx handshake as the server being unreachable', () => {
    expect(dropCause(530)).toBe('server-unreachable')
    expect(dropCause(503)).toBe('server-unreachable')
    expect(dropCause(undefined)).toBe('connection-lost')
    expect(dropCause(0)).toBe('connection-lost')
  })

  it('settles stopped after stop', async () => {
    const transport = new PartySocketTransport(
      {
        url: 'ws://relay.invalid',
        subprotocol: 'porte.test',
        authorization: 'Bearer test',
        cliVersion: '0.0.0',
      },
      new FakePartySocket(),
    )
    transport.start({ onFrame: async () => undefined })
    transport.stop()
    await expect(transport.stopped).resolves.toBeUndefined()
  })
})
