import { SessionSummarySchema } from '@lras/core'
import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'

import { SessionCatalog } from '../src/sessions/session-catalog.ts'

describe('SessionCatalog', () => {
  it('lists public summaries from stored sessions', async () => {
    const summary = SessionSummarySchema.parse({
      id: 'session-1',
      cwd: '/repo',
      title: 'LRAS',
      updatedAt: '2026-08-17T12:00:00.000Z',
    })
    const catalog = new SessionCatalog({ list: async () => Result.ok([{ summary }]) })

    const listed = await catalog.list()

    expect(listed.isOk() && listed.value).toEqual([summary])
  })
})
