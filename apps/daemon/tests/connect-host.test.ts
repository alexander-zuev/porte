import { IsoDateTimeSchema, SessionSummarySchema, type DaemonMessage } from '@lras/core'
import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'

import { connectHost, type ConnectHostDeps } from '../src/host/connect-host.ts'

const sent: DaemonMessage[] = []
const session = SessionSummarySchema.parse({
  id: 'session-1',
  cwd: '/repo',
  title: 'LRAS',
  updatedAt: '2026-08-17T12:00:00.000Z',
})

const deps: ConnectHostDeps = {
  sessions: { list: async () => [session] },
  clock: { now: () => IsoDateTimeSchema.parse('2026-08-17T12:01:00.000Z') },
  relay: {
    run: async ({ handlers }) => {
      await handlers.onConnected({ send: (message) => sent.push(message) })
      return Result.ok()
    },
  },
}

describe('connectHost', () => {
  it('publishes the session catalog after connection', async () => {
    sent.length = 0
    const result = await connectHost(
      { relayUrl: 'wss://example.com', token: 'secret', signal: new AbortController().signal },
      deps,
    )

    expect(result.isOk()).toBe(true)
    expect(sent[0]).toMatchObject({ message: { event: 'sessions.changed' } })
  })
})
