import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileHostLedger } from '@host/adapters/node/host-ledger.ts'
import {
  WebSocketPorteRelay,
  retryDelayMs,
} from '@host/adapters/websocket/websocket-porte-relay.ts'
import { createOperationId } from '@porte/core/client'
import { Result } from 'better-result'
import { describe, expect, it, vi } from 'vitest'

class MockPartySocket extends EventTarget {
  readonly retryCount = 0
  reconnectCalls = 0
  closeCalls = 0
  sendCalls = 0
  private openState = false

  send(): boolean {
    this.sendCalls += 1
    return this.openState
  }

  close(): void {
    this.closeCalls += 1
    this.openState = false
  }

  reconnect(): void {
    this.reconnectCalls += 1
  }

  open(): void {
    this.openState = true
    this.dispatchEvent(new Event('open'))
  }

  receive(data: string): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}

describe('retryDelayMs', () => {
  it('uses a bounded exponential delay', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(retryDelayMs)).toEqual([
      0, 250, 500, 1_000, 2_000, 4_000, 5_000,
    ])
  })
})

describe('WebSocketPorteRelay', () => {
  it('does not open storage or a socket for a stopped connection', async () => {
    const controller = new AbortController()
    controller.abort()
    const relay = new WebSocketPorteRelay(
      { connected: () => undefined, reconnecting: () => undefined },
      new FileHostLedger('/not-opened/host-ledger.json'),
    )

    const result = await relay.run({
      relayUrl: 'not a URL',
      token: 'unused',
      signal: controller.signal,
      handlers: {
        onConnected: async () => Result.ok(),
        onCommand: async () => Result.ok(),
      },
    })

    expect(result.isOk()).toBe(true)
  })

  it('does not reconnect when delayed command work finishes after stop', async () => {
    const test = await delayedCommandTest()
    try {
      test.socket.open()
      test.socket.receive(syncCommand(test.operationId))
      test.controller.abort()
      expect((await test.running).isOk()).toBe(true)
      test.releaseCommand()
      await vi.waitFor(() => {
        expect(test.socket.sendCalls).toBe(1)
      })
      expect(test.socket.reconnectCalls).toBe(0)
      test.socket.open()
      expect([test.socket.closeCalls, test.connectedCalls()]).toEqual([2, 1])
    } finally {
      await rm(test.folder, { recursive: true, force: true })
    }
  })
})

async function delayedCommandTest() {
  const folder = await mkdtemp(join(tmpdir(), 'porte-relay-'))
  const socket = new MockPartySocket()
  const operationId = createOperationId()
  const controller = new AbortController()
  const commandGate = deferred()
  let connectedCalls = 0
  const socketReady = deferred()
  const relay = new WebSocketPorteRelay(
    {
      connected: () => {
        connectedCalls += 1
      },
      reconnecting: () => undefined,
    },
    new FileHostLedger(join(folder, 'host-ledger.json')),
    () => {
      socketReady.resolve()
      return socket
    },
  )
  const running = relay.run({
    relayUrl: 'wss://relay.test/api/host/ws',
    token: 'token',
    signal: controller.signal,
    handlers: {
      onConnected: async () => Result.ok(),
      onCommand: async (_command, connection) => {
        await commandGate.promise
        connection.sendCommandResponse({
          v: 2,
          type: 'command.result',
          operationId,
          result: { eventHeads: {} },
        })
        return Result.ok()
      },
    },
  })
  await socketReady.promise
  return {
    connectedCalls: () => connectedCalls,
    controller,
    folder,
    operationId,
    releaseCommand: commandGate.resolve,
    running,
    socket,
  }
}

function deferred() {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: () => resolvePromise?.() }
}

function syncCommand(operationId: ReturnType<typeof createOperationId>): string {
  return JSON.stringify({
    v: 2,
    type: 'command',
    operationId,
    method: 'conversations.sync',
    params: {},
  })
}
