import { SessionSupervisor } from '@host/application/session-supervisor.ts'
import { CodingAgentUnavailableError } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

describe('SessionSupervisor.closeAll', () => {
  it('closes an empty supervisor once', async () => {
    const sessions = new SessionSupervisor({
      listConversations: async () => ({ conversations: [] }),
      openConversation: () => Promise.reject(new TypeError('unexpected open')),
      createConversation: () => Promise.reject(new TypeError('unexpected create')),
    })
    await sessions.closeAll()
    await sessions.closeAll()
    await expect(sessions.createConversation('/tmp')).rejects.toBeInstanceOf(
      CodingAgentUnavailableError,
    )
  })
})
