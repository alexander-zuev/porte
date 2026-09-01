import { createCommand, createQuery } from '@host/domain/messages/types.ts'
import { ChangedFilePathSchema, ConversationIdSchema } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

import { createTestDeps } from '../support/test-deps.ts'

const conversationId = ConversationIdSchema.parse('conversation-1')

/** A conversation open on this Host; its cwd is this test's own checkout, so a git root exists. */
async function openConversation() {
  const deps = createTestDeps()
  await deps.bus.handle(createCommand('OpenConversation', { conversationId, cwd: process.cwd() }))
  return deps
}

describe('changes queries', () => {
  it('lists the uncommitted changes of the conversation’s repository root', async () => {
    const deps = await openConversation()
    deps.workingTree.uncommitted = {
      branch: 'main',
      files: [
        {
          kind: 'text',
          path: ChangedFilePathSchema.parse('a.ts'),
          status: 'modified',
          added: 1,
          removed: 0,
        },
      ],
    }
    const result = await deps.bus.handle(createQuery('ListChanges', { conversationId }))
    expect(result).toEqual(deps.workingTree.uncommitted)
    expect(deps.workingTree.asked).toEqual([deps.conversations.get(conversationId).gitRoot])
  })

  it('reads one diff from the same root', async () => {
    const deps = await openConversation()
    const path = ChangedFilePathSchema.parse('a.ts')
    deps.workingTree.diffs.set(path, { kind: 'binary' })
    const result = await deps.bus.handle(createQuery('GetDiff', { conversationId, path }))
    expect(result).toEqual({ kind: 'binary' })
  })

  it('fails for a conversation this Host does not hold', async () => {
    const deps = createTestDeps()
    await expect(
      deps.bus.handle(createQuery('ListChanges', { conversationId })),
    ).rejects.toMatchObject({ _tag: 'ConversationNotFoundError' })
  })
})
