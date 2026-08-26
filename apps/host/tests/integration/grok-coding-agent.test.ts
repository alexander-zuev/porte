import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GrokCodingAgent } from '@host/infrastructure/grok/grok-coding-agent.ts'
import {
  ConversationIdSchema,
  ConversationNotFoundError,
  WorkspaceNotAllowedError,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

import { createGitWorkspace, grokOnPath, withGrokCodingAgent } from './grok-resources.ts'

const GROK_TIMEOUT_MS = 180_000

describe.skipIf(!grokOnPath())('GrokCodingAgent', () => {
  it(
    'creates a conversation and returns an idle snapshot',
    async () => {
      await withGrokCodingAgent(async (agent) => {
        const created = await agent.createConversation(await createGitWorkspace())
        expect(agent.snapshot(created.id).turn).toEqual({ state: 'idle' })
        expect(agent.snapshot(created.id).items).toEqual([])
      })
    },
    GROK_TIMEOUT_MS,
  )

  it(
    'opens a closed conversation back onto the same process',
    async () => {
      await withGrokCodingAgent(async (agent) => {
        const created = await agent.createConversation(await createGitWorkspace())
        await agent.closeConversation(created.id)
        expect(() => agent.snapshot(created.id)).toThrow(ConversationNotFoundError)

        await agent.openConversation(created.id)
        expect(agent.snapshot(created.id).turn).toEqual({ state: 'idle' })
      })
    },
    GROK_TIMEOUT_MS,
  )

  it(
    'does not reload a conversation that is already open',
    async () => {
      await withGrokCodingAgent(async (agent) => {
        const created = await agent.createConversation(await createGitWorkspace())
        await agent.openConversation(created.id)
        await agent.openConversation(created.id)
        expect(agent.snapshot(created.id).turn).toEqual({ state: 'idle' })
      })
    },
    GROK_TIMEOUT_MS,
  )

  it(
    'rejects open for an unknown conversation',
    async () => {
      await withGrokCodingAgent(async (agent) => {
        await expect(
          agent.openConversation(ConversationIdSchema.parse('missing-conversation')),
        ).rejects.toBeInstanceOf(ConversationNotFoundError)
      })
    },
    GROK_TIMEOUT_MS,
  )

  it('rejects create outside a git workspace', async () => {
    await withGrokCodingAgent(async (agent) => {
      const cwd = await mkdtemp(join(tmpdir(), 'porte-nogit-'))
      await expect(agent.createConversation(cwd)).rejects.toBeInstanceOf(WorkspaceNotAllowedError)
    })
  })
})
