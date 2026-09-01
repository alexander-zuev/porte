import { MessageBus } from '@host/application/message-bus.ts'
import { createCommand, createQuery } from '@host/domain/messages/types.ts'
import { createAgentInbound } from '@host/entrypoints/acp/acp-inbound.ts'
import { AcpCodingAgent } from '@host/infrastructure/acp/acp-coding-agent.ts'
import type { AppDeps } from '@host/infrastructure/app-deps.ts'
import { GitWorkspaceChanges } from '@host/infrastructure/git/git-workspace-changes.ts'
import { startGrok } from '@host/infrastructure/grok/grok-launch.ts'
import { NodeBackgroundTasks } from '@host/infrastructure/node/background-tasks.ts'
import { NodeScheduler } from '@host/infrastructure/node/scheduler.ts'
import { EventOutbox } from '@host/infrastructure/persistence/event-outbox.ts'
import { InMemoryConversationRepository } from '@host/infrastructure/persistence/in-memory-conversation-repository.ts'
import {
  MessageIdSchema,
  createAttemptId,
  turnIdFor,
  type ConversationId,
} from '@porte/core/client'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { FakeConnections } from '../support/test-deps.ts'
import { cleanupGrokSessions, createGitWorkspace, liveGrokTestsEnabled } from './grok-resources.ts'

afterAll(cleanupGrokSessions)

/**
 * The host as `porte up` runs it — real Grok, real bus, real handlers — with the
 * relay sockets replaced by a recorder. One test per flow the product depends on.
 */
const GROK_TIMEOUT_MS = 180_000
type Harness = AppDeps & { connections: FakeConnections }

async function withHost(body: (deps: Harness) => Promise<void>): Promise<void> {
  const shutdown = new AbortController()
  const outbox = new EventOutbox()
  const deps: Harness = {
    outbox,
    conversations: new InMemoryConversationRepository(outbox),
    workspaceChanges: new GitWorkspaceChanges(),
    connections: new FakeConnections(),
    background: new NodeBackgroundTasks(),
    scheduler: new NodeScheduler(),
    now: () => new Date(),
    get bus() {
      return bus
    },
    get codingAgent() {
      return codingAgent
    },
  }
  const bus = new MessageBus(deps)
  const codingAgent = await AcpCodingAgent.start(
    (callbacks) => startGrok(shutdown.signal, callbacks),
    createAgentInbound(bus, deps.background),
  )
  try {
    await body(deps)
  } finally {
    await bus.handle(createCommand('CloseAllConversations', {}))
    await deps.background.drain()
    shutdown.abort()
  }
}

function userMessage(text: string) {
  return { id: MessageIdSchema.parse(`${text}:user`), content: [{ type: 'text' as const, text }] }
}

async function turnFinished(deps: Harness, conversationId: ConversationId): Promise<void> {
  await vi.waitFor(
    () => {
      const sent = deps.connections.sent.get(conversationId) ?? []
      expect(sent.some((event) => event.type === 'turn.finished')).toBe(true)
    },
    { timeout: 120_000, interval: 250 },
  )
}

describe.skipIf(!liveGrokTestsEnabled())('host flows against real Grok', () => {
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
