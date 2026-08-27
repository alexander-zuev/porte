import { createConversation } from '@host/application/commands/create-conversation.command.ts'
import { listConversations } from '@host/application/queries/list-conversations.query.ts'
import { normaliseGitRoot } from '@host/infrastructure/grok/git-root.ts'
import { GrokCodingAgent } from '@host/infrastructure/grok/grok-coding-agent.ts'
import {
  CodingAgentUnavailableError,
  ListConversationsResultSchema,
  type ConversationId,
  type ConversationCursor,
  type ConversationSummary,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

import { createGitWorkspace, grokOnPath, withGrokCodingAgent } from './grok-resources.ts'

const LIST_PAGES = 40
const GROK_TIMEOUT_MS = 180_000

describe('listConversations', () => {
  describe('happy', () => {
    it.skipIf(!grokOnPath())(
      'returns the conversation this host created',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const cwd = await createGitWorkspace()
          const created = await createConversation(agent, { cwd })
          await agent.closeConversation(created.id)

          const listed = await findListed(agent, created.id)
          expect(listed?.id).toBe(created.id)
          expect(listed?.cwd).toBe(cwd)
          expect(listed?.gitRoot).toBe(normaliseGitRoot(cwd))
        })
      },
      GROK_TIMEOUT_MS,
    )
  })

  describe('unhappy', () => {
    it('fails when the host signal is already aborted', async () => {
      const shutdown = new AbortController()
      shutdown.abort()
      await expect(
        listConversations(new GrokCodingAgent(shutdown.signal), {}),
      ).rejects.toBeInstanceOf(CodingAgentUnavailableError)
    })
  })
})

async function findListed(
  agent: GrokCodingAgent,
  conversationId: ConversationId,
): Promise<ConversationSummary | undefined> {
  let cursor: ConversationCursor | undefined
  for (let pageIndex = 0; pageIndex < LIST_PAGES; pageIndex += 1) {
    // oxlint-disable-next-line no-await-in-loop -- ACP gives each cursor in the prior page.
    const page = await listConversations(agent, cursor === undefined ? {} : { cursor })
    const listed = ListConversationsResultSchema.parse(page)
    const found = listed.conversations.find((row) => row.id === conversationId)
    if (found !== undefined) return found
    if (listed.next === undefined) return undefined
    cursor = listed.next
  }
  return undefined
}
