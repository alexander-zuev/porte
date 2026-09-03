import type { RelayStatus } from '@host/application/ports/relay-status.ts'
import {
  HEARTBEAT,
  PartySocketTransport,
  attachHeartbeat,
  dropCause,
  type HeartbeatSocket,
} from '@host/infrastructure/websocket/party-socket-transport.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeHeartbeatSocket implements HeartbeatSocket {
  readonly readyState = 1
  pings = 0
  terminated = false
  private pong: (() => void) | undefined
  private closeListener: (() => void) | undefined

  ping(): void {
    this.pings += 1
  }

  terminate(): void {
    this.terminated = true
  }

  on(_event: 'pong', listener: () => void): void {
    this.pong = listener
  }

  once(_event: 'close', listener: () => void): void {
    this.closeListener = listener
  }

  answerPong(): void {
    this.pong?.()
  }

  close(): void {
    this.closeListener?.()
  }
}

describe('attachHeartbeat', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('terminates the socket when the pong is late', () => {
    vi.useFakeTimers()
    const socket = new FakeHeartbeatSocket()
    attachHeartbeat(socket)
    vi.advanceTimersByTime(HEARTBEAT.pingIntervalMs)
    expect(socket.pings).toBe(1)
    vi.advanceTimersByTime(HEARTBEAT.pongDeadlineMs - 1)
    expect(socket.terminated).toBe(false)
    vi.advanceTimersByTime(1)
    expect(socket.terminated).toBe(true)
  })

  it('a pong in time keeps the socket and the next ping comes on schedule', () => {
    vi.useFakeTimers()
    const socket = new FakeHeartbeatSocket()
    attachHeartbeat(socket)
    vi.advanceTimersByTime(HEARTBEAT.pingIntervalMs)
    socket.answerPong()
    vi.advanceTimersByTime(HEARTBEAT.pingIntervalMs)
    expect(socket.pings).toBe(2)
    expect(socket.terminated).toBe(false)
  })

  it('stops with the socket', () => {
    vi.useFakeTimers()
    const socket = new FakeHeartbeatSocket()
    attachHeartbeat(socket)
    vi.advanceTimersByTime(HEARTBEAT.pingIntervalMs)
    socket.close()
    vi.advanceTimersByTime(HEARTBEAT.pongDeadlineMs + HEARTBEAT.pingIntervalMs)
    expect(socket.terminated).toBe(false)
    expect(socket.pings).toBe(1)
  })
})

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
