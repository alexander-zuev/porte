import { IsoDateTimeSchema, SessionSummarySchema, type DaemonMessage } from '@porte/core'
import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'

import { HostConnector } from '../src/application/connect-host.ts'
import { SessionStoreError } from '../src/errors.ts'

const sent: DaemonMessage[] = []
const session = SessionSummarySchema.parse({
  id: 'session-1',
  cwd: '/repo',
  title: 'Porte',
  updatedAt: '2026-08-17T12:00:00.000Z',
})

const connector = new HostConnector(
  { list: async () => Result.ok([session]) },
  { now: () => IsoDateTimeSchema.parse('2026-08-17T12:01:00.000Z') },
  {
    run: async ({ handlers }) =>
      handlers.onConnected({
        sessionsChanged: (catalog) => {
          sent.push({
            audience: { type: 'host' },
            message: { v: 1, type: 'event', event: 'sessions.changed', data: { catalog } },
          })
        },
      }),
  },
)

describe('connectHost', () => {
  it('publishes the session catalog after connection', async () => {
    sent.length = 0
    const result = await connector.connect({
      relayUrl: 'wss://example.com',
      token: 'secret',
      signal: new AbortController().signal,
    })

    expect(result.isOk()).toBe(true)
    expect(sent[0]).toMatchObject({ message: { event: 'sessions.changed' } })
  })

  it('returns a catalog failure from the relay callback', async () => {
    const error = new SessionStoreError({ operation: 'list', cause: 'unavailable' })
    const failed = new HostConnector(
      { list: async () => Result.err(error) },
      { now: () => IsoDateTimeSchema.parse('2026-08-17T12:01:00.000Z') },
      { run: async ({ handlers }) => handlers.onConnected({ sessionsChanged: () => undefined }) },
    )

    const result = await failed.connect({
      relayUrl: 'wss://example.com',
      token: 'secret',
      signal: new AbortController().signal,
    })

    expect(result.isErr() && result.error._tag).toBe('SessionStoreError')
  })
})
