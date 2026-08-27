import { HostRuntime } from '@host/application/host-runtime.ts'
import type { AnyMessage } from '@host/domain/messages/base.ts'
import { describe, expect, it, vi } from 'vitest'

describe('HostRuntime', () => {
  it('closes conversations, drains background work, then drops the sockets', async () => {
    const test = runtimeTest()
    const running = test.runtime.run()
    await vi.waitFor(() => {
      expect(test.events).toContain('control started')
    })
    test.shutdown.abort()
    await running
    expect(test.events).toEqual([
      'control started',
      'CloseAllConversations',
      'drained',
      'connections closed',
    ])
  })
})

function runtimeTest() {
  const events: string[] = []
  const shutdown = new AbortController()
  const runtime = new HostRuntime(shutdown.signal, {
    connections: {
      controlStopped: new Promise(() => undefined),
      control: { conversationUpdated: () => undefined },
      connectControl: () => {
        events.push('control started')
      },
      connectConversation: () => undefined,
      conversation: () => null,
      closeConversation: () => undefined,
      closeAll: () => {
        events.push('connections closed')
      },
    },
    bus: {
      handle: async (message: AnyMessage) => {
        events.push(message.name)
        // SAFETY: the runtime only dispatches CloseAllConversations, whose result is void.
        return undefined as never
      },
    },
    background: {
      run: () => undefined,
      drain: async () => {
        events.push('drained')
      },
    },
  })
  return { events, runtime, shutdown }
}
