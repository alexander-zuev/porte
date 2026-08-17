import { SessionSummarySchema } from '@lras/core'
import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'

import { SessionResumer } from '../src/sessions/session-resumer.ts'

describe('SessionResumer', () => {
  it('runs the resume sequence through injected ports', async () => {
    const { calls, resumer, summary } = makeHarness()

    const result = await resumer.resume(summary.id, 'continue', () => undefined)

    expect(result.isOk()).toBe(true)
    expect(calls).toEqual(['initialize', 'authenticate', 'load', 'prompt', 'stop'])
  })
})

function makeHarness() {
  const calls: string[] = []
  const summary = SessionSummarySchema.parse({
    id: 'session-1',
    cwd: '/repo',
    title: 'LRAS',
    updatedAt: '2026-08-17T12:00:00.000Z',
  })
  const agent = {
    initialize: async () => record(calls, 'initialize'),
    authenticate: async () => record(calls, 'authenticate'),
    load: async () => record(calls, 'load'),
    prompt: async () => record(calls, 'prompt'),
    stop: async () => {
      calls.push('stop')
    },
  }
  const resumer = new SessionResumer(
    { find: async () => Result.ok({ summary }) },
    { start: async () => Result.ok(agent) },
  )
  return { calls, resumer, summary }
}

function record(calls: string[], value: string) {
  calls.push(value)
  return Result.ok()
}
