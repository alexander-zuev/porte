import { describe, expect, it } from 'vitest'

import { CodingSessionLifecycleEventSchema } from '../src/coding-session-lifecycle-event.ts'

const base = { eventId: 'event-1', sessionId: 'session-1' }

describe('CodingSessionLifecycleEventSchema', () => {
  it('parses an explicit metadata clear', () => {
    const result = CodingSessionLifecycleEventSchema.safeParse({
      ...base,
      type: 'session.metadata.updated',
      update: { title: null, updatedAt: null },
    })

    expect(result.success).toBe(true)
  })

  it('rejects an empty metadata update', () => {
    const result = CodingSessionLifecycleEventSchema.safeParse({
      ...base,
      type: 'session.metadata.updated',
      update: {},
    })

    expect(result.success).toBe(false)
  })

  it('parses a safe session failure', () => {
    const result = CodingSessionLifecycleEventSchema.safeParse({
      ...base,
      type: 'session.failed',
      error: { code: 'CODING_AGENT_UNAVAILABLE', message: 'Agent unavailable' },
    })

    expect(result.success).toBe(true)
  })
})
