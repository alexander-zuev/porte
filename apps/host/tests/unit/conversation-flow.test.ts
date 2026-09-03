import { setImmediate } from 'node:timers/promises'

import { CANCEL_DEADLINE_MS } from '@host/application/turn-policy.ts'
import { createCommand, createQuery } from '@host/domain/messages/types.ts'
import {
  AttemptIdSchema,
  ConversationBusyError,
  ConversationIdSchema,
  MessageIdSchema,
  PermissionIdSchema,
  ToolCallIdSchema,
  createAttemptId,
  turnIdFor,
  type ConversationEvent,
  type ConversationId,
  type TurnId,
} from '@porte/core/client'
import { describe, expect, it, vi } from 'vitest'

import { FakeConnections, createTestDeps, type TestDeps } from '../support/test-deps.ts'

type Flow = {
  deps: TestDeps
  connections: FakeConnections
  conversationId: ConversationId
  /** The id Grok gave the first turn: prompt index 0. */
  turnId: TurnId
}

const attemptId = AttemptIdSchema.parse('0199f97b-9cf1-7f05-9e9d-df1647d7a821')
const secondAttemptId = AttemptIdSchema.parse('0199f97b-9cf1-7f05-9e9d-df1647d7a822')
const userMessage = {
  id: MessageIdSchema.parse('browser-1'),
  content: [{ type: 'text' as const, text: 'hi' }],
}
const permission = (turnId: TurnId) => ({
  permissionId: PermissionIdSchema.parse(`${turnId}:permission:1`),
  toolCallId: ToolCallIdSchema.parse('tool-1'),
  title: 'Write file',
  options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' as const }],
})

/** What the mapper emits when Grok echoes `text` as the prompt that opens `turnId`. */
function echo(turnId: TurnId, text: string): ConversationEvent[] {
  const messageId = MessageIdSchema.parse(`${turnId}:user`)
  return [
    { type: 'turn.started', turnId, attemptId: createAttemptId() },
    { type: 'message.started', turnId, messageId, role: 'user' },
    { type: 'message.delta', turnId, messageId, content: { type: 'text', text } },
    { type: 'message.completed', turnId, messageId },
  ]
}

const finished = (turnId: TurnId): ConversationEvent => ({
  type: 'turn.finished',
  turnId,
  outcome: { type: 'completed', reason: 'completed' },
})

/** Let inbound agent work (one macrotask) settle without waiting on the parked prompt. */
const flushed = () => setImmediate()

/** Create, attach a socket, start a turn, let Grok echo it: the state every flow begins from. */
async function running(): Promise<Flow> {
  const connections = new FakeConnections()
  const deps = createTestDeps(() => connections)
  const created = await deps.bus.handle(createCommand('CreateConversation', { cwd: process.cwd() }))
  await connections.connectConversation(created.id, process.cwd())
  const turnId = turnIdFor(created.id, 0)
  const start = deps.bus.handle(
    createCommand('StartTurn', { conversationId: created.id, attemptId, userMessage }),
  )
  await flushed()
  deps.codingAgent.push(created.id, echo(turnId, 'hi'))
  expect(await start).toBe(turnId)
  // The request answers on `turn.started`; the rest of the echo publishes right after.
  await flushed()
  return { deps, connections, conversationId: created.id, turnId }
}

function sentTypes({ connections, conversationId }: Flow): string[] {
  return (connections.sent.get(conversationId) ?? []).map((event) => event.type)
}

describe('conversation flows through the bus', () => {
  it('start turn: the prompt reaches Grok, its echo opens the turn bound to the attempt', async () => {
    const flow = await running()
    expect(flow.deps.codingAgent.prompted).toEqual([{ id: flow.conversationId, text: 'hi' }])
    expect(sentTypes(flow)).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
      'message.completed',
    ])
    expect(flow.connections.sent.get(flow.conversationId)?.[0]).toMatchObject({
      type: 'turn.started',
      turnId: flow.turnId,
      attemptId,
    })
  })

  it('a turn typed in the terminal reaches the socket with no prompt from this Host', async () => {
    const connections = new FakeConnections()
    const deps = createTestDeps(() => connections)
    const created = await deps.bus.handle(
      createCommand('CreateConversation', { cwd: process.cwd() }),
    )
    await connections.connectConversation(created.id, process.cwd())
    const turnId = turnIdFor(created.id, 0)
    deps.codingAgent.push(created.id, echo(turnId, 'from the terminal'))
    await flushed()
    const state = await deps.bus.handle(
      createQuery('GetConversation', { conversationId: created.id }),
    )
    expect(state.turn).toMatchObject({ state: 'running', turnId })
    expect(state.items[0]).toMatchObject({ role: 'user', content: [{ text: 'from the terminal' }] })
    deps.codingAgent.push(created.id, [finished(turnId)])
    await flushed()
    const after = await deps.bus.handle(
      createQuery('GetConversation', { conversationId: created.id }),
    )
    expect(after.turn).toEqual({ state: 'idle' })
    expect(deps.codingAgent.prompted).toEqual([])
  })

  it('a refused prompt fails the request and leaves the conversation free', async () => {
    const connections = new FakeConnections()
    const deps = createTestDeps(() => connections)
    const created = await deps.bus.handle(
      createCommand('CreateConversation', { cwd: process.cwd() }),
    )
    await connections.connectConversation(created.id, process.cwd())
    const start = deps.bus.handle(
      createCommand('StartTurn', { conversationId: created.id, attemptId, userMessage }),
    )
    await flushed()
    deps.codingAgent.refuse(created.id, new Error('refused'))
    await expect(start).rejects.toThrow('refused')
    expect(
      sentTypes({
        deps,
        connections,
        conversationId: created.id,
        turnId: turnIdFor(created.id, 0),
      }),
    ).toEqual([])
    // The next attempt is not busy: nothing is pending any more.
    const next = deps.bus.handle(
      createCommand('StartTurn', {
        conversationId: created.id,
        attemptId: secondAttemptId,
        userMessage,
      }),
    )
    await flushed()
    deps.codingAgent.push(created.id, echo(turnIdFor(created.id, 0), 'hi'))
    await expect(next).resolves.toBe(turnIdFor(created.id, 0))
  })

  it('a second attempt while one runs is refused and never reaches the agent', async () => {
    const { deps, conversationId } = await running()
    await expect(
      deps.bus.handle(
        createCommand('StartTurn', { conversationId, attemptId: secondAttemptId, userMessage }),
      ),
    ).rejects.toBeInstanceOf(ConversationBusyError)
    expect(deps.codingAgent.prompted).toHaveLength(1)
  })

  it('a repeated attempt answers with its turn: no second prompt, no second turn.started', async () => {
    const flow = await running()
    const { deps, conversationId, turnId } = flow
    await expect(
      deps.bus.handle(createCommand('StartTurn', { conversationId, attemptId, userMessage })),
    ).resolves.toBe(turnId)
    expect(deps.codingAgent.prompted).toHaveLength(1)
    expect(sentTypes(flow).filter((type) => type === 'turn.started')).toHaveLength(1)
  })

  it('streams agent updates into the view and to the socket; the stream ends the turn with usage', async () => {
    const flow = await running()
    const { deps, conversationId, turnId } = flow
    const messageId = MessageIdSchema.parse(`${turnId}:assistant:1`)
    deps.codingAgent.push(conversationId, [
      { type: 'message.started', turnId, messageId, role: 'assistant' },
      { type: 'message.delta', turnId, messageId, content: { type: 'text', text: 'pong' } },
    ])
    await flushed()
    deps.codingAgent.push(conversationId, [
      { type: 'message.completed', turnId, messageId },
      { type: 'conversation.usage.updated', usage: { usedTokens: 10, sizeTokens: 100 } },
      finished(turnId),
    ])
    deps.codingAgent.settle(conversationId)
    await deps.background.drain()

    const state = await deps.bus.handle(createQuery('GetConversation', { conversationId }))
    expect(state.turn).toEqual({ state: 'idle' })
    expect(state.items.at(-1)).toMatchObject({ role: 'assistant', content: [{ text: 'pong' }] })
    expect(state.usage).toEqual({ usedTokens: 10, sizeTokens: 100 })
    expect(sentTypes(flow).slice(-3)).toEqual([
      'message.completed',
      'conversation.usage.updated',
      'turn.finished',
    ])
  })

  it('permission: request parks on the turn, the answer releases the agent request', async () => {
    const { deps, conversationId, turnId } = await running()
    const request = permission(turnId)
    deps.codingAgent.listener?.onPermissionRequest(conversationId, request)
    await flushed()
    const pending = await deps.bus.handle(createQuery('GetConversation', { conversationId }))
    expect(pending.pending.permissions).toHaveLength(1)

    await deps.bus.handle(
      createCommand('AnswerPermission', {
        conversationId,
        turnId,
        permissionId: request.permissionId,
        optionId: 'allow',
      }),
    )
    expect(deps.codingAgent.resolvePermission).toHaveBeenCalledWith(request.permissionId, {
      type: 'selected',
      optionId: 'allow',
    })
  })

  it('permission answered in the terminal: the tool runs, the card goes, the agent request is released', async () => {
    const { deps, conversationId, turnId } = await running()
    const request = permission(turnId)
    deps.codingAgent.listener?.onPermissionRequest(conversationId, request)
    await flushed()
    deps.codingAgent.push(conversationId, [
      {
        type: 'tool.updated',
        turnId,
        tool: {
          toolCallId: request.toolCallId,
          title: 'Write file',
          kind: 'edit',
          status: 'in_progress',
          content: [],
          locations: [],
        },
      },
    ])
    await flushed()
    const state = await deps.bus.handle(createQuery('GetConversation', { conversationId }))
    expect(state.pending.permissions).toEqual([])
    expect(deps.codingAgent.resolvePermission).toHaveBeenCalledWith(request.permissionId, {
      type: 'answered-elsewhere',
    })
  })

  it('cancel: pending answers resolve as cancelled before the agent is told; the stream ends the turn', async () => {
    const flow = await running()
    const { deps, conversationId, turnId } = flow
    const request = permission(turnId)
    deps.codingAgent.listener?.onPermissionRequest(conversationId, request)
    await flushed()
    const order: string[] = []
    vi.spyOn(deps.codingAgent, 'resolvePermission').mockImplementation(() => {
      order.push('release')
    })
    vi.spyOn(deps.codingAgent, 'cancel').mockImplementation(async () => {
      order.push('cancel')
      deps.codingAgent.push(conversationId, [
        { type: 'turn.finished', turnId, outcome: { type: 'cancelled' } },
      ])
    })
    await deps.bus.handle(createCommand('CancelTurn', { conversationId, turnId }))
    await deps.background.drain()

    // ACP: the client answers pending permission requests as cancelled; do it before `session/cancel`.
    expect(order.slice(0, 2)).toEqual(['release', 'cancel'])
    const state = await deps.bus.handle(createQuery('GetConversation', { conversationId }))
    expect(state.turn).toEqual({ state: 'idle' })
    expect(flow.connections.sent.get(conversationId)?.at(-1)).toMatchObject({
      type: 'turn.finished',
      outcome: { type: 'cancelled' },
    })
  })

  it('cancel after the turn ended is a no-op', async () => {
    const { deps, conversationId, turnId } = await running()
    deps.codingAgent.push(conversationId, [finished(turnId)])
    await deps.background.drain()
    await expect(
      deps.bus.handle(createCommand('CancelTurn', { conversationId, turnId })),
    ).resolves.toBeUndefined()
    expect(deps.codingAgent.cancel).not.toHaveBeenCalled()
  })

  it('cancel deadline: an agent that never ends the turn has it ended here; its late end is dropped', async () => {
    const flow = await running()
    const { deps, conversationId, turnId } = flow
    await deps.bus.handle(createCommand('CancelTurn', { conversationId, turnId }))
    deps.scheduler.fire(CANCEL_DEADLINE_MS)
    // Grok has not answered the prompt, so the background still holds it; one macrotask is enough here.
    await flushed()
    expect(deps.codingAgent.closeSession).not.toHaveBeenCalled()
    const state = await deps.bus.handle(createQuery('GetConversation', { conversationId }))
    expect(state.turn).toEqual({ state: 'idle' })
    expect(sentTypes(flow).filter((type) => type === 'turn.finished')).toHaveLength(1)

    deps.codingAgent.push(conversationId, [
      { type: 'turn.finished', turnId, outcome: { type: 'cancelled' } },
    ])
    await deps.background.drain()
    expect(sentTypes(flow).filter((type) => type === 'turn.finished')).toHaveLength(1)
  })

  it('turn.get returns one turn slice with every item stamped by its turn', async () => {
    const flow = await running()
    const { deps, conversationId, turnId } = flow
    const messageId = MessageIdSchema.parse(`${turnId}:assistant:1`)
    deps.codingAgent.push(conversationId, [
      { type: 'message.started', turnId, messageId, role: 'assistant' },
      { type: 'message.delta', turnId, messageId, content: { type: 'text', text: 'pong' } },
    ])
    await flushed()
    const slice = await deps.bus.handle(createQuery('GetTurn', { conversationId, turnId }))
    expect(slice.items.map((item) => item.turnId)).toEqual([turnId, turnId])
    expect(slice.items.map((item) => item.type)).toEqual(['message', 'message'])
  })

  it('close while running: the socket drops, the session is only forgotten, Grok is not cancelled', async () => {
    const { deps, connections, conversationId } = await running()
    await deps.bus.handle(createCommand('CloseConversation', { conversationId }))
    // Grok's turn goes on without this Host; the prompt answers whenever it ends.
    deps.codingAgent.settle(conversationId)
    await deps.background.drain()
    expect(deps.codingAgent.closeSession).toHaveBeenCalledWith(conversationId)
    expect(deps.codingAgent.cancel).not.toHaveBeenCalled()
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
