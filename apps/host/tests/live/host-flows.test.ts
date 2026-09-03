import { createCommand, createQuery } from '@host/domain/messages/types.ts'
import { createAttemptId, turnIdFor } from '@porte/core/client'
import { afterAll, expect, it } from 'vitest'

import { cleanupGrokSessions, createGitWorkspace, describeLive } from './grok-resources.ts'
import { GROK_TIMEOUT_MS, turnFinished, userMessage, withHost } from './host-harness.ts'

afterAll(cleanupGrokSessions)

/** One test per flow the product depends on, against real Grok. */
describeLive('host flows against real Grok', () => {
  it(
    'creates a conversation and lists it with its git root',
    async () => {
      await withHost(async (deps) => {
        const cwd = await createGitWorkspace()
        const created = await deps.bus.handle(createCommand('CreateConversation', { cwd }))
        expect(created).toMatchObject({ cwd, gitRoot: cwd })
        const listed = await deps.bus.handle(createQuery('ListConversations', {}))
        expect(listed.conversations.some((row) => row.id === created.id)).toBe(true)
      })
    },
    GROK_TIMEOUT_MS,
  )

  it(
    'sends a message: the reply streams to the socket and the turn finishes',
    async () => {
      await withHost(async (deps) => {
        const cwd = await createGitWorkspace()
        const { id } = await deps.bus.handle(createCommand('CreateConversation', { cwd }))
        deps.connections.connectConversation(id, cwd)
        await deps.bus.handle(
          createCommand('StartTurn', {
            conversationId: id,
            attemptId: createAttemptId(),
            userMessage: userMessage('Reply with exactly: ping'),
          }),
        )
        await turnFinished(deps, id)
        const types = (deps.connections.sent.get(id) ?? []).map((event) => event.type)
        expect(types[0]).toBe('turn.started')
        expect(types).toContain('message.delta')
        expect(types.at(-1)).toBe('turn.finished')
        const state = await deps.bus.handle(createQuery('GetConversation', { conversationId: id }))
        expect(state.items.filter((item) => item.type === 'message')).toHaveLength(2)
      })
    },
    GROK_TIMEOUT_MS,
  )

  it(
    'opens a closed conversation and gets its messages back',
    async () => {
      await withHost(async (deps) => {
        const cwd = await createGitWorkspace()
        const { id } = await deps.bus.handle(createCommand('CreateConversation', { cwd }))
        deps.connections.connectConversation(id, cwd)
        await deps.bus.handle(
          createCommand('StartTurn', {
            conversationId: id,
            attemptId: createAttemptId(),
            userMessage: userMessage('Reply with exactly: pong'),
          }),
        )
        await turnFinished(deps, id)
        await deps.bus.handle(createCommand('CloseConversation', { conversationId: id }))

        await deps.bus.handle(createCommand('OpenConversation', { conversationId: id, cwd }))
        const state = await deps.bus.handle(createQuery('GetConversation', { conversationId: id }))
        expect(state.items.filter((item) => item.type === 'message')).toHaveLength(2)
        expect(state.items[0]).toMatchObject({
          role: 'user',
          content: [{ text: 'Reply with exactly: pong' }],
        })
      })
    },
    GROK_TIMEOUT_MS,
  )

  it(
    'cancels a running turn',
    async () => {
      await withHost(async (deps) => {
        const cwd = await createGitWorkspace()
        const { id } = await deps.bus.handle(createCommand('CreateConversation', { cwd }))
        deps.connections.connectConversation(id, cwd)
        const turnId = turnIdFor(id, 0)
        await deps.bus.handle(
          createCommand('StartTurn', {
            conversationId: id,
            attemptId: createAttemptId(),
            userMessage: userMessage('Write a long essay about git rebase.'),
          }),
        )
        await deps.bus.handle(createCommand('CancelTurn', { conversationId: id, turnId }))
        await turnFinished(deps, id)
        const finished = (deps.connections.sent.get(id) ?? []).find(
          (event) => event.type === 'turn.finished',
        )
        expect(finished).toMatchObject({ outcome: { type: 'cancelled' } })
      })
    },
    GROK_TIMEOUT_MS,
  )
})
