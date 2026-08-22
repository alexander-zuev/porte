import {
  RELAY_HEARTBEAT_INTERVAL_MS,
  RELAY_HEARTBEAT_REQUEST,
  RELAY_HEARTBEAT_TIMEOUT_MS,
} from '@porte/core/client'
import { RelayConnection } from '@web/entities/host/relay-connection.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class TestWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: TestWebSocket[] = []

  readyState = TestWebSocket.CONNECTING
  readonly sent: string[] = []

  constructor(readonly url: string) {
    super()
    TestWebSocket.instances.push(this)
  }

  send(frame: string): void {
    this.sent.push(frame)
  }

  close(): void {
    if (this.readyState === TestWebSocket.CLOSED) return
    this.readyState = TestWebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }

  open(): void {
    this.readyState = TestWebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  receive(frame: string): void {
    this.dispatchEvent(new MessageEvent('message', { data: frame }))
  }
}

const handlers = {
  onHostStatus() {},
  onConversationsInvalidated() {},
  onConversationChanged() {},
  onConversationRemoved() {},
}

beforeEach(() => {
  vi.useFakeTimers()
  TestWebSocket.instances = []
  vi.stubGlobal('WebSocket', TestWebSocket)
  vi.stubGlobal('window', { location: { href: 'https://porte.test/' } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RelayConnection heartbeat', () => {
  it('keeps the connection after the relay responds', async () => {
    const relay = new RelayConnection(handlers)
    relay.connect()
    const socket = TestWebSocket.instances[0]
    socket?.open()
    await vi.advanceTimersByTimeAsync(RELAY_HEARTBEAT_INTERVAL_MS)
    socket?.receive('pong')
    await vi.advanceTimersByTimeAsync(RELAY_HEARTBEAT_TIMEOUT_MS)
    expect(socket).toMatchObject({
      readyState: TestWebSocket.OPEN,
      sent: [RELAY_HEARTBEAT_REQUEST],
    })
    relay.close()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('closes and reconnects after a missed response', async () => {
    const relay = new RelayConnection(handlers)
    relay.connect()
    TestWebSocket.instances[0]?.open()
    await vi.advanceTimersByTimeAsync(RELAY_HEARTBEAT_INTERVAL_MS + RELAY_HEARTBEAT_TIMEOUT_MS)
    expect(TestWebSocket.instances[0]?.readyState).toBe(TestWebSocket.CLOSED)
    await vi.advanceTimersByTimeAsync(500)
    expect(TestWebSocket.instances).toHaveLength(2)
    relay.close()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores frames from a retired socket', async () => {
    const onHostStatus = vi.fn()
    const relay = new RelayConnection({ ...handlers, onHostStatus })
    relay.connect()
    const retired = TestWebSocket.instances[0]
    retired?.open()
    await vi.advanceTimersByTimeAsync(
      RELAY_HEARTBEAT_INTERVAL_MS + RELAY_HEARTBEAT_TIMEOUT_MS + 500,
    )
    retired?.receive(
      JSON.stringify({ v: 1, type: 'event', event: 'host.status', data: { status: 'online' } }),
    )
    expect(onHostStatus).not.toHaveBeenCalled()
    relay.close()
  })
})
