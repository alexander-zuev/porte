import { HostRuntime } from '@host/application/host-runtime.ts'
import { describe, expect, it, vi } from 'vitest'

describe('HostRuntime', () => {
  it('closes sessions before connections', async () => {
    const test = runtimeTest()
    const running = test.runtime.run()
    await vi.waitFor(() => {
      expect(test.events).toContain('control started')
    })
    test.shutdown.abort()
    await running
    expect(test.events).toEqual(['control started', 'sessions closed', 'connections closed'])
  })
})

function runtimeTest() {
  const events: string[] = []
  const shutdown = new AbortController()
  const runtime = new HostRuntime(
    shutdown.signal,
    {
      controlStopped: new Promise(() => undefined),
      connectControl: () => {
        events.push('control started')
      },
      closeAll: async () => {
        events.push('connections closed')
      },
    },
    {
      closeAll: async () => {
        events.push('sessions closed')
      },
    },
  )
  return { events, runtime, shutdown }
}
