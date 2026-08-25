import { PartySocketTransport } from '@host/infrastructure/websocket/party-socket-transport.ts'
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

  it('settles stopped after stop', async () => {
    const transport = new PartySocketTransport(
      {
        url: 'ws://relay.invalid',
        subprotocol: 'porte.test',
        authorization: 'Bearer test',
      },
      new FakePartySocket(),
    )
    transport.start({ onFrame: async () => undefined })
    transport.stop()
    await expect(transport.stopped).resolves.toBeUndefined()
  })
})
