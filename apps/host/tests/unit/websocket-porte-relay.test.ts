import {
  WebSocketPorteRelay,
  retryDelayMs,
  WebSocketPorteConnection,
} from '@host/adapters/websocket/websocket-porte-relay.ts'
import {
  ConversationEventSchema,
  RELAY_HEARTBEAT_INTERVAL_MS,
  RELAY_HEARTBEAT_TIMEOUT_MS,
} from '@porte/core/client'
import { Result } from 'better-result'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'

class TestSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING
  pings = 0
  terminations = 0
  private pongListener: (() => void) | undefined

  send(): void {}
  ping(): void {
    this.pings++
  }
  terminate(): void {
    this.terminations++
    this.finish()
  }
  close(): void {
    this.finish()
  }
  on(event: string, listener: () => void): this {
    if (event === 'pong') this.pongListener = listener
    return this
  }
  open(): void {
    this.readyState = WebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }
  pong(): void {
    this.pongListener?.()
  }
  private finish(): void {
    if (this.readyState === WebSocket.CLOSED) return
    this.readyState = WebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }
}

function asWebSocket(socket: TestSocket): WebSocket {
  // SAFETY: TestSocket implements each WebSocket member that WebSocketPorteRelay uses.
  // @ts-expect-error The test double omits WebSocket members that the adapter never reads.
  return socket as WebSocket
}

afterEach(() => vi.useRealTimers())

describe('retryDelayMs', () => {
  it('uses bounded exponential delays', () => {
    expect([0, 1, 2, 3, 4, 5].map(retryDelayMs)).toEqual([250, 500, 1_000, 2_000, 4_000, 5_000])
  })
})

describe('WebSocketPorteConnection', () => {
  it('routes a canonical event to its conversation audience', () => {
    const sent: string[] = []
    const connection = new WebSocketPorteConnection((frame) => sent.push(frame))
    const event = ConversationEventSchema.parse({
      eventId: 'event-1',
      conversationId: 'conversation-1',
      type: 'turn.started',
      turnId: '0198b55e-49d6-7e0f-9917-b08777b451b9',
    })

    connection.sendConversationEvent(event)

    expect(sent).toEqual([
      JSON.stringify({
        audience: { type: 'conversation', conversationId: 'conversation-1' },
        message: { v: 1, type: 'event', event: 'conversation.event', data: event },
      }),
    ])
  })
})

describe('WebSocketPorteRelay', () => {
  it('keeps checking after the host receives pong', async () => {
    vi.useFakeTimers()
    const socket = new TestSocket()
    const { controller, running } = runRelay(() => asWebSocket(socket))
    socket.open()
    await vi.advanceTimersByTimeAsync(RELAY_HEARTBEAT_INTERVAL_MS)
    socket.pong()
    await vi.advanceTimersByTimeAsync(RELAY_HEARTBEAT_INTERVAL_MS)
    expect(socket).toMatchObject({ pings: 2, terminations: 0 })
    controller.abort()
    expect((await running).isOk()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('terminates and reconnects after a missed pong', async () => {
    vi.useFakeTimers()
    const first = new TestSocket()
    const second = new TestSocket()
    const available = [first, second]
    const { controller, running } = runRelay(() =>
      asWebSocket(available.shift() ?? new TestSocket()),
    )
    first.open()
    await vi.advanceTimersByTimeAsync(RELAY_HEARTBEAT_INTERVAL_MS + RELAY_HEARTBEAT_TIMEOUT_MS)
    expect(first).toMatchObject({ pings: 1, terminations: 1 })
    await vi.advanceTimersByTimeAsync(retryDelayMs(0))
    expect(available).toHaveLength(0)
    controller.abort()
    expect((await running).isOk()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})

function runRelay(createSocket: () => WebSocket) {
  const controller = new AbortController()
  const relay = new WebSocketPorteRelay({ connected() {}, reconnecting() {} }, createSocket)
  return {
    controller,
    running: relay.run({
      relayUrl: 'wss://relay.test',
      token: 'test-token',
      signal: controller.signal,
      handlers: { onConnected: async () => Result.ok(), onRequest: async () => Result.ok() },
    }),
  }
}
