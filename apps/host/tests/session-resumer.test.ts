import { SessionSummarySchema } from '@porte/core'
import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'

import type { ResumeCodingAgentSession } from '../src/sessions/coding-agent-sessions.ts'
import { SessionResumer } from '../src/sessions/session-resumer.ts'

describe('SessionResumer', () => {
  it('finds the session and passes it to the coding agent', async () => {
    const { commands, resumer, summary } = makeHarness()

    const result = await resumer.resume(summary.id, 'continue', () => undefined)

    expect(result.isOk()).toBe(true)
    expect(commands).toEqual([{ sessionId: summary.id, cwd: '/repo', prompt: 'continue' }])
  })
})

function makeHarness() {
  const commands: object[] = []
  const summary = SessionSummarySchema.parse({
    id: 'session-1',
    cwd: '/repo',
    title: 'Porte',
    updatedAt: '2026-08-17T12:00:00.000Z',
  })
  const agents = {
    resume: async ({ onEvent: _onEvent, ...command }: ResumeCodingAgentSession) => {
      commands.push(command)
      return Result.ok()
    },
  }
  const resumer = new SessionResumer({ find: async () => Result.ok({ summary }) }, agents)
  return { commands, resumer, summary }
}
