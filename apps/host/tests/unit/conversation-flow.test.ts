import { setImmediate } from 'node:timers/promises'

import { createCommand, createQuery } from '@host/domain/messages/types.ts'
import {
  ConversationBusyError,
  ConversationIdSchema,
  MessageIdSchema,
  PermissionIdSchema,
  ToolCallIdSchema,
  TurnIdSchema,
  type ConversationId,
} from '@porte/core/client'
import { describe, expect, it, vi } from 'vitest'

import { FakeConnections, createTestDeps, type TestDeps } from '../support/test-deps.ts'

type Flow = { deps: TestDeps; connections: FakeConnections; conversationId: ConversationId }

const turnId = TurnIdSchema.parse('turn-1')
const userMessage = {
  id: MessageIdSchema.parse('turn-1:user'),
  content: [{ type: 'text' as const, text: 'hi' }],
}
const permission = {
  permissionId: PermissionIdSchema.parse('turn-1:permission:1'),
  toolCallId: ToolCallIdSchema.parse('tool-1'),
  title: 'Write file',
  options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' as const }],
}

/** Create, attach a socket, start a turn: the state every flow below begins from. */
async function running(): Promise<Flow> {
  const connections = new FakeConnections()
  const deps = createTestDeps(() => connections)
  const created = await deps.bus.handle(createCommand('CreateConversation', { cwd: process.cwd() }))
  connections.connectConversation(created.id, process.cwd())
  await deps.bus.handle(
    createCommand('StartTurn', { conversationId: created.id, turnId, userMessage }),
  )
  return { deps, connections, conversationId: created.id }
}

/** Let inbound agent work (one macrotask) settle without waiting on the parked prompt. */
const flushed = () => setImmediate()

function sentTypes({ connections, conversationId }: Flow): string[] {
  return (connections.sent.get(conversationId) ?? []).map((event) => event.type)
}

describe('conversation flows through the bus', () => {
  it('start turn: aggregate raises the turn, the socket gets the events, the agent gets the prompt', async () => {
    const flow = await running()
    expect(sentTypes(flow)).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
      'message.completed',
    ])
    expect(flow.deps.codingAgent.running).toEqual([flow.conversationId])
  })

  it('a second turn while one runs is refused and never reaches the agent', async () => {
    const { deps, conversationId } = await running()
    const prompt = vi.spyOn(deps.codingAgent, 'prompt')
    await expect(
      deps.bus.handle(
        createCommand('StartTurn', {
          conversationId,
          turnId: TurnIdSchema.parse('turn-2'),
          userMessage,
        }),
      ),
    ).rejects.toBeInstanceOf(ConversationBusyError)
    expect(prompt).not.toHaveBeenCalled()
  })

  it('streams agent updates into the view and to the socket, then finishes with usage', async () => {
    const flow = await running()
    const { deps, conversationId } = flow
    const messageId = MessageIdSchema.parse('turn-1:assistant:1')
    deps.codingAgent.push(conversationId, [
      { type: 'message.started', turnId, messageId, role: 'assistant' },
      { type: 'message.delta', turnId, messageId, content: { type: 'text', text: 'pong' } },
    ])
    await flushed()
    deps.codingAgent.settle(conversationId, {
      outcome: { type: 'completed', reason: 'completed' },
      usage: { usedTokens: 10, sizeTokens: 100 },
    })
    await deps.background.drain()

    const state = await deps.bus.handle(createQuery('GetConversation', { conversationId }))
    expect(state.turn).toEqual({ state: 'idle' })
    expect(state.items.at(-1)).toMatchObject({ role: 'assistant', content: [{ text: 'pong' }] })
    expect(state.usage).toEqual({ usedTokens: 10, sizeTokens: 100 })
    expect(sentTypes(flow).slice(-3)).toEqual([
      'message.delta',
      'conversation.usage.updated',
      'turn.finished',
    ])
  })

  it('permission: request parks on the turn, the answer releases the agent request', async () => {
    const { deps, conversationId } = await running()
    deps.codingAgent.listener?.onPermissionRequest(conversationId, permission)
    await flushed()
    const pending = await deps.bus.handle(createQuery('GetConversation', { conversationId }))
    expect(pending.pending.permissions).toHaveLength(1)

    await deps.bus.handle(
      createCommand('AnswerPermission', {
        conversationId,
        turnId,
        permissionId: permission.permissionId,
        optionId: 'allow',
      }),
    )
    expect(deps.codingAgent.resolvePermission).toHaveBeenCalledWith(permission.permissionId, {
      type: 'selected',
      optionId: 'allow',
    })
  })

  it('cancel: pending answers resolve as cancelled, the agent is told, the turn ends cancelled', async () => {
    const flow = await running()
    const { deps, conversationId } = flow
    deps.codingAgent.listener?.onPermissionRequest(conversationId, permission)
    await flushed()
    await deps.bus.handle(createCommand('CancelTurn', { conversationId, turnId }))
    await deps.background.drain()

    expect(deps.codingAgent.resolvePermission).toHaveBeenCalledWith(permission.permissionId, {
      type: 'cancelled',
    })
    expect(deps.codingAgent.cancel).toHaveBeenCalledWith(conversationId)
    const state = await deps.bus.handle(createQuery('GetConversation', { conversationId }))
    expect(state.turn).toEqual({ state: 'idle' })
    expect(sentTypes(flow).at(-1)).toBe('turn.finished')
  })

  it('close while running: the agent is cancelled, the socket dropped, the late finish ignored', async () => {
    const { deps, connections, conversationId } = await running()
    await deps.bus.handle(createCommand('CloseConversation', { conversationId }))
    await deps.background.drain()
    expect(deps.codingAgent.closeSession).toHaveBeenCalledWith(conversationId)
    expect(connections.attached.has(conversationId)).toBe(false)
    expect(deps.conversations.find(conversationId)).toBeNull()
  })

  it('open: a reconnect is a no-op, a fresh id loads and replays', async () => {
    const deps = createTestDeps()
    const conversationId = ConversationIdSchema.parse('existing')
    const load = vi.spyOn(deps.codingAgent, 'loadSession')
    await deps.bus.handle(createCommand('OpenConversation', { conversationId, cwd: process.cwd() }))
    await deps.bus.handle(createCommand('OpenConversation', { conversationId, cwd: process.cwd() }))
    expect(load).toHaveBeenCalledTimes(1)
    expect(deps.conversations.get(conversationId).title).toBe('Loaded')
  })
})
