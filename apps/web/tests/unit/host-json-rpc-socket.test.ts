import {
  ConversationIdSchema,
  HostControlMethods,
  jsonRpcNotification,
  type HostControlMethodMap,
} from '@porte/core'
import { HostJsonRpcSocket } from '@server/infrastructure/durable-objects/relay/host-json-rpc-socket.ts'
import type { Connection } from 'agents'
import { describe, expect, it } from 'vitest'

const conversationId = ConversationIdSchema.parse('c1')

/** The SDK types a facet's Host socket as a bridge object with no `readyState`. */
function connection(id: string): Connection {
  // SAFETY: the client only reads `id`, and `send` on a bridge returns nothing.
  return { id, send: () => undefined } as unknown as Connection
}

function updated(seq: number): string {
  const params: HostControlMethodMap['conversation.updated']['params'] = {
    // SAFETY: the test builds the frame the Host would; the client re-parses it.
    seq: seq as HostControlMethodMap['conversation.updated']['params']['seq'],
    conversationId,
    update: { title: `title ${String(seq)}` },
  }
  return JSON.stringify(jsonRpcNotification('conversation.updated', params))
}

describe('HostJsonRpcSocket ordering', () => {
  it('applies notifications by seq even when frames cross in the bridge', async () => {
    const applied: number[] = []
    const saved: number[] = []
    const socket = new HostJsonRpcSocket({
      methods: HostControlMethods,
      notificationHandlers: {
        'conversation.updated': async (params) => {
          applied.push(params.seq)
        },
        'conversation.removed': async () => undefined,
      },
      sequence: {
        load: async () => 0,
        save: async (_connectionId, seq) => {
          saved.push(seq)
        },
      },
    })
    const host = connection('host-1')
    socket.attach(host)

    await socket.handleMessage(host, updated(1))
    await socket.handleMessage(host, updated(3))
    await socket.handleMessage(host, updated(2))

    expect(applied).toEqual([1, 2, 3])
    expect(saved.at(-1)).toBe(3)
  })

  it('keeps the waiter when a send failed after the frame may have left (F13)', async () => {
    const socket = new HostJsonRpcSocket({
      methods: HostControlMethods,
      notificationHandlers: {
        'conversation.updated': async () => undefined,
        'conversation.removed': async () => undefined,
      },
      sequence: { load: async () => 0, save: async () => undefined },
    })
    let sent: string | undefined
    const flaky = {
      id: 'host-1',
      send: (frame: string) => {
        // The bridge dispatched the frame, then threw; the Host may still answer.
        sent = frame
        throw new Error('RPC stub failed after dispatch')
      },
      // SAFETY: the client only reads `id` and `send`.
    } as unknown as Connection
    socket.attach(flaky)

    const listing = socket.request('conversations.list', {})
    await Promise.resolve()
    // SAFETY: the test parses the frame the client just built.
    const request = JSON.parse(sent ?? '{}') as { id: string }
    await socket.handleMessage(
      flaky,
      JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { conversations: [] } }),
    )
    await expect(listing).resolves.toEqual({ conversations: [] })
  })

  it('resumes from the persisted seq after a wake', async () => {
    const applied: number[] = []
    const socket = new HostJsonRpcSocket({
      methods: HostControlMethods,
      notificationHandlers: {
        'conversation.updated': async (params) => {
          applied.push(params.seq)
        },
        'conversation.removed': async () => undefined,
      },
      sequence: { load: async () => 41, save: async () => undefined },
    })
    const host = connection('host-1')
    socket.attach(host)

    await socket.handleMessage(host, updated(43))
    await socket.handleMessage(host, updated(42))

    expect(applied).toEqual([42, 43])
  })
})
