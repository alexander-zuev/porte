import {
  AttemptIdSchema,
  ChangedFilePathSchema,
  ConversationIdSchema,
  HOST_CONTROL_SUBPROTOCOL,
  HOST_CONVERSATION_SUBPROTOCOL,
  IsoDateTimeSchema,
  MessageIdSchema,
  PermissionIdSchema,
  ToolCallIdSchema,
  createAttemptId,
  createHostId,
  hostControlRequestSchema,
  hostConversationRequestSchema,
  jsonRpcNotification,
  turnIdFor,
  type ConversationEvent,
  type ConversationState,
  type ConversationSummary,
  type HostControlRequestMethod,
  type HostConversationRequestMethod,
  type HostId,
  type MessageId,
  type TurnId,
} from '@porte/core'
import { ConversationAgent } from '@server/infrastructure/durable-objects/conversation-agent.ts'
import type { HostRelayAgent } from '@server/infrastructure/durable-objects/host-relay-agent.ts'
import { RELAY_HOST_ID_HEADER } from '@server/infrastructure/durable-objects/relay/relay-headers.ts'
import { queuedRows } from '@web/lib/conversation/conversation-state-messages.ts'
import { getSubAgentByName } from 'agents'
import type { UIMessage } from 'ai'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { applyDatabaseTestMigrations } from './database-test-migrations.ts'

/**
 * The seams reading alone could not settle, driven through
 * the public boundary: the viewer WebSocket, the Host sockets, and get-messages.
 */
const conversation: ConversationSummary = {
  id: ConversationIdSchema.parse('01a04a00-0000-7000-8000-000000000001'),
  cwd: '/workspace/porte',
  gitRoot: '/workspace/porte',
  title: 'Turn flows',
  updatedAt: IsoDateTimeSchema.parse('2026-08-28T00:00:00.000Z'),
}

const idleState: ConversationState = {
  turn: { state: 'idle' },
  items: [],
  tools: [],
  plans: [],
  pending: { permissions: [], elicitations: [] },
}

beforeAll(applyDatabaseTestMigrations)

/** Every socket a test opened; closed after it so no relay send is in flight at teardown. */
const openSockets: WebSocket[] = []

afterEach(async () => {
  const sockets = openSockets.splice(0)
  await Promise.all(sockets.map(closeSocket))
})

function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve()
  return new Promise((resolve) => {
    socket.addEventListener('close', () => resolve(), { once: true })
    if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'test complete')
  })
}

describe('ConversationAgent through its facet', () => {
  it('keeps the user row with its browser id and orders crossed frames (F11, F12)', async () => {
    const flow = await openConversation()
    const viewer = await flow.viewer()
    viewer.socket.send(chatRequest('req-1', 'browser-1', 'hi'))

    const start = await flow.nextDataRequest('turn.start')
    const params = TurnStartParamsSchema.parse(start.params)
    expect(params.userMessage.id).toBe('browser-1')
    const turnId = turnIdFor(conversation.id, 0)
    const send = flow.eventSender()
    send({ type: 'turn.started', turnId, attemptId: params.attemptId })
    send(userEcho(turnId, 'hi'))
    flow.data.socket.send(JSON.stringify({ jsonrpc: '2.0', id: start.id, result: null }))
    send({ type: 'message.started', turnId, messageId: assistantId(turnId), role: 'assistant' })
    // The sender reverses each batch on the wire; seq order must still win.
    send(delta(turnId, 'hello'), delta(turnId, ' world'))
    send({ type: 'message.completed', turnId, messageId: assistantId(turnId) })
    send({ type: 'turn.finished', turnId, outcome: { type: 'completed', reason: 'completed' } })

    const turnGet = await flow.nextDataRequest('turn.get')
    expect(z.object({ turnId: z.string() }).parse(turnGet.params).turnId).toBe(turnId)
    // The Host's version differs from the stream, so the final row proves who won.
    flow.data.socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: turnGet.id,
        result: turnSlice(turnId, 'hello world, reconciled'),
      }),
    )

    await vi.waitFor(async () => {
      const rows = await flow.messages()
      expect(rows.map((row) => `${row.role} ${row.id}`)).toEqual([
        'user browser-1',
        `assistant ${turnId}`,
      ])
      expect(rows[0]?.metadata).toEqual({ turnId })
      expect(JSON.stringify(rows[1]?.parts)).toContain('hello world, reconciled')
    })

    // A browser that connects later is seeded by the socket, not by HTTP.
    const late = await flow.viewer()
    const seed = await nextRequest(late.inbox, ChatMessagesFrameSchema)
    expect(seed.messages.map((row) => `${row.role} ${row.id}`)).toEqual([
      'user browser-1',
      `assistant ${turnId}`,
    ])
  })

  it('leaves exactly one assistant row when a snapshot lands during a stream', async () => {
    const flow = await openConversation()
    const viewer = await flow.viewer()
    viewer.socket.send(chatRequest('req-1', 'browser-1', 'hi'))

    const start = await flow.nextDataRequest('turn.start')
    const params = TurnStartParamsSchema.parse(start.params)
    const turnId = turnIdFor(conversation.id, 0)
    const send = flow.eventSender()
    send({ type: 'turn.started', turnId, attemptId: params.attemptId })
    send(userEcho(turnId, 'hi'))
    send({ type: 'message.started', turnId, messageId: assistantId(turnId), role: 'assistant' })
    send(delta(turnId, 'partial'))
    flow.data.socket.send(JSON.stringify({ jsonrpc: '2.0', id: start.id, result: null }))

    // The Host socket reconnects mid-stream; the fresh snapshot carries the running partial.
    // The store must not gain a second version of the streaming turn: one writer per turn.
    const reconnected = await flow.reconnectData()
    const get = await flow.nextDataRequest('conversation.get')
    reconnected.socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: get.id,
        result: {
          ...finishedTurn(turnId, 'hi', 'partial'),
          turn: { state: 'running', turnId, attemptId: params.attemptId },
          plans: [],
          pending: { permissions: [], elicitations: [] },
        },
      }),
    )

    // The stream then ends on the new socket; the reconcile writes the one final row.
    const send2 = flow.eventSender()
    send2({ type: 'turn.finished', turnId, outcome: { type: 'completed', reason: 'completed' } })
    const turnGet = await flow.nextDataRequest('turn.get')
    flow.data.socket.send(
      JSON.stringify({ jsonrpc: '2.0', id: turnGet.id, result: turnSlice(turnId, 'final') }),
    )

    await vi.waitFor(async () => {
      const rows = await flow.messages()
      expect(rows.filter((row) => row.role === 'assistant')).toHaveLength(1)
      expect(rows.filter((row) => row.role === 'user')).toHaveLength(1)
      expect(JSON.stringify(rows.find((row) => row.role === 'assistant')?.parts)).toContain('final')
    })
  })

  it.todo(
    'survives a facet hibernation between two Host requests (F13; unit-covered in host-json-rpc-socket.test.ts)',
  )
})

/**
 * The queue, driven the way a person drives it: the browser sends and queues
 * through the DO's public surface, the Host is scripted turn by turn, and every
 * assertion reads the store or the requests the Host received.
 */
describe('ConversationAgent queue', () => {
  it('a new Host socket starts its seq at 1; a count carried over the reconnect is parked', async () => {
    const flow = await openConversation()
    const viewer = await flow.viewer()
    viewer.socket.send(chatRequest('req-1', 'browser-1', 'hi'))
    const { turnId, params } = await flow.host.startTurn()
    flow.host.stream(turnId, 'partial')
    const carried = flow.lastSeq()

    const reconnected = await flow.reconnectData()
    const get = await flow.nextDataRequest('conversation.get')
    reconnected.socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: get.id,
        result: {
          ...finishedTurn(turnId, 'hi', 'partial'),
          turn: { state: 'running', turnId, attemptId: params.attemptId },
          plans: [],
          pending: { permissions: [], elicitations: [] },
        },
      }),
    )

    // A Host that kept counting: the relay waits for 1..carried, so no reconcile follows.
    const finished = {
      type: 'turn.finished',
      turnId,
      outcome: { type: 'completed', reason: 'completed' },
    } as const
    reconnected.socket.send(
      JSON.stringify(
        jsonRpcNotification('conversation.event', { seq: carried + 1, event: finished }),
      ),
    )
    expect(await flow.host.requestsWithin(300)).toEqual([])

    // The same event at seq 1 on the new socket applies and reconciles the turn.
    await flow.host.finishTurn(turnId, 'hi', 'final')
    await vi.waitFor(async () => {
      const rows = await flow.messages()
      expect(JSON.stringify(rows[1]?.parts)).toContain('final')
    })
  })

  it('queues while a turn runs, then runs the queue one message per turn, in order', async () => {
    const flow = await openConversation()
    const viewer = await flow.viewer()
    viewer.socket.send(chatRequest('req-1', 'browser-1', 'first'))
    const first = await flow.host.startTurn()
    flow.host.stream(first.turnId, 'working')

    await flow.call('queueMessage', queued('q-1', 'second'))
    await flow.call('queueMessage', queued('q-2', 'third'))
    await vi.waitFor(async () => {
      expect(queuedTexts(await flow.messages())).toEqual(['second', 'third'])
    })
    await flow.host.expectNoRequestFor(300)

    await flow.host.finishTurn(first.turnId, 'first', 'working')
    const second = await flow.host.startTurn()
    expect(second.params.userMessage.id).toBe('q-1')
    expect(userText(second.params)).toBe('second')
    await vi.waitFor(async () => {
      const ids = (await flow.messages()).map((row) => row.id)
      // The started row takes its place after the answer it waited for.
      expect(ids.indexOf('q-1')).toBeGreaterThan(ids.indexOf(first.turnId))
      expect(queuedTexts(await flow.messages())).toEqual(['third'])
    })

    await flow.host.finishTurn(second.turnId, 'second', 'done')
    const third = await flow.host.startTurn()
    expect(third.params.userMessage.id).toBe('q-2')
    await vi.waitFor(async () => {
      expect(queuedTexts(await flow.messages())).toEqual([])
    })
  })

  it('starts a queued message at once when nothing runs', async () => {
    const flow = await openConversation()
    await flow.call('queueMessage', queued('q-1', 'alone'))
    const started = await flow.host.startTurn()
    expect(started.params.userMessage.id).toBe('q-1')
  })

  it('send now cancels the running turn and starts that row alone, the rest stay queued', async () => {
    const flow = await openConversation()
    const viewer = await flow.viewer()
    viewer.socket.send(chatRequest('req-1', 'browser-1', 'first'))
    const first = await flow.host.startTurn()
    flow.host.stream(first.turnId, 'working')
    await flow.call('queueMessage', queued('q-1', 'second'))
    await flow.call('queueMessage', queued('q-2', 'third'))

    const sendNow = flow.call('sendQueuedNow', { messageId: MessageIdSchema.parse('q-2') })
    const cancel = await flow.nextDataRequest('turn.cancel')
    expect(z.object({ turnId: z.string() }).parse(cancel.params).turnId).toBe(first.turnId)
    flow.data.socket.send(JSON.stringify({ jsonrpc: '2.0', id: cancel.id, result: null }))
    await sendNow
    await flow.host.finishTurn(first.turnId, 'first', 'working', { type: 'cancelled' })

    const started = await flow.host.startTurn()
    expect(started.params.userMessage.id).toBe('q-2')
    expect(userText(started.params)).toBe('third')
    await vi.waitFor(async () => {
      expect(queuedTexts(await flow.messages())).toEqual(['second'])
    })
  })

  it('stop with a queue drains it, like Grok', async () => {
    const flow = await openConversation()
    const viewer = await flow.viewer()
    viewer.socket.send(chatRequest('req-1', 'browser-1', 'first'))
    const first = await flow.host.startTurn()
    await flow.call('queueMessage', queued('q-1', 'second'))

    const stop = flow.call('cancelTurn', { turnId: first.turnId })
    const cancel = await flow.nextDataRequest('turn.cancel')
    flow.data.socket.send(JSON.stringify({ jsonrpc: '2.0', id: cancel.id, result: null }))
    await stop
    await flow.host.finishTurn(first.turnId, 'first', 'partial', { type: 'cancelled' })

    const started = await flow.host.startTurn()
    expect(userText(started.params)).toBe('second')
    // The stop mark is the reconciled row's own, so a reload still shows it.
    await vi.waitFor(async () => {
      const answer = (await flow.messages()).find((row) => row.id === first.turnId)
      expect(answer?.metadata).toEqual({ turnId: first.turnId, outcome: 'cancelled' })
    })
  })

  it('reorder and remove change what the next turn carries', async () => {
    const flow = await openConversation()
    const viewer = await flow.viewer()
    viewer.socket.send(chatRequest('req-1', 'browser-1', 'first'))
    const first = await flow.host.startTurn()
    await flow.call('queueMessage', queued('q-1', 'a'))
    await flow.call('queueMessage', queued('q-2', 'b'))
    await flow.call('queueMessage', queued('q-3', 'c'))

    await flow.call('reorderQueued', { messageId: MessageIdSchema.parse('q-3'), position: 1 })
    await flow.call('withdrawQueued', { messageId: MessageIdSchema.parse('q-2') })
    expect(queuedTexts(await flow.messages())).toEqual(['c', 'a'])

    await flow.host.finishTurn(first.turnId, 'first', '')
    const started = await flow.host.startTurn()
    expect(started.params.userMessage.id).toBe('q-3')
    expect(userText(started.params)).toBe('c')
    await vi.waitFor(async () => {
      expect(queuedTexts(await flow.messages())).toEqual(['a'])
    })
  })

  it('a Host snapshot mid-turn keeps the queued rows', async () => {
    const flow = await openConversation()
    const viewer = await flow.viewer()
    viewer.socket.send(chatRequest('req-1', 'browser-1', 'first'))
    const first = await flow.host.startTurn()
    await flow.call('queueMessage', queued('q-1', 'second'))

    const reconnected = await flow.reconnectData()
    const get = await flow.nextDataRequest('conversation.get')
    reconnected.socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: get.id,
        result: {
          ...finishedTurn(first.turnId, 'first', ''),
          turn: { state: 'running', turnId: first.turnId, attemptId: first.params.attemptId },
        },
      }),
    )
    await vi.waitFor(async () => {
      const rows = await flow.messages()
      expect(rows.map((row) => row.id)).toContain('browser-1')
      expect(queuedTexts(rows)).toEqual(['second'])
    })
  })

  it('withdrawing a row that already started is a no-op', async () => {
    const flow = await openConversation()
    await flow.call('queueMessage', queued('q-1', 'alone'))
    await flow.host.startTurn()
    await flow.call('withdrawQueued', { messageId: MessageIdSchema.parse('q-1') })
    expect((await flow.messages()).map((row) => row.id)).toContain('q-1')
  })

  it('a drain whose settle wait times out schedules another from an alarm', async () => {
    // Protected on the SDK class; the test and the facet share one isolate, so the prototype is the seam.
    const settle = vi
      .spyOn(
        ConversationAgent.prototype as unknown as { waitUntilStable: () => Promise<boolean> },
        'waitUntilStable',
      )
      .mockResolvedValue(false)
    const flow = await openConversation()
    await flow.call('queueMessage', queued('q-1', 'alone'))
    await flow.host.expectNoRequestFor(300)
    await vi.waitFor(async () => {
      // The stub type lists only the subclass's methods; the SDK's are still RPC-callable.
      const agent = (await flow.agent()) as unknown as {
        listSchedules: () => Promise<{ callback: string }[]>
      }
      const schedules = await agent.listSchedules()
      expect(schedules.map((schedule) => schedule.callback)).toContain('drainQueueScheduled')
    })
    settle.mockRestore()

    await (await flow.agent()).drainQueueScheduled()
    const started = await flow.host.startTurn()
    expect(started.params.userMessage.id).toBe('q-1')
  })
})
/**
 * Turns nobody in Porte asked for: the terminal typed them, the Host observed
 * them on the shared Grok session, and the relay must show them like any other.
 */
describe('turns the Host observed', () => {
  it('streams a terminal turn to viewers, persists its user row, and reconciles it', async () => {
    const flow = await openConversation()
    const viewer = await flow.viewer()
    const turnId = turnIdFor(conversation.id, 0)
    const send = flow.eventSender()
    // No `turn.start` came from a browser; the attempt id is the Host's own.
    send({ type: 'turn.started', turnId, attemptId: createAttemptId() })
    send(userEcho(turnId, ''))
    send(userDelta(turnId, 'from the terminal'))
    send(userCompleted(turnId))

    // The user row reaches viewers before any answer, built from the events alone.
    const seeded = await nextRequest(viewer.inbox, {
      safeParse: (value: unknown) => {
        const parsed = ChatMessagesFrameSchema.safeParse(value)
        return parsed.success && parsed.data.messages.length > 0
          ? parsed
          : { success: false as const }
      },
    })
    expect(seeded.messages.map((row) => `${row.role} ${row.id}`)).toEqual([`user ${turnId}:user`])

    flow.host.stream(turnId, 'hello from grok')
    // Viewers get the live stream although none of them started the turn.
    const chunk = await nextRequest(viewer.inbox, chatResponseContaining('hello from grok'))
    expect(chunk.type).toBe('cf_agent_use_chat_response')

    await flow.host.finishTurn(turnId, 'from the terminal', 'hello from grok, reconciled')
    await vi.waitFor(async () => {
      const rows = await flow.messages()
      expect(rows.map((row) => `${row.role} ${row.id}`)).toEqual([
        `user ${turnId}:user`,
        `assistant ${turnId}`,
      ])
      expect(JSON.stringify(rows[1]?.parts)).toContain('reconciled')
    })
  })

  /**
   * Opened mid-turn: the viewer arrives while the terminal's turn runs. The Host's
   * answer is a snapshot with a partial reply, never a `turn.started` event. Each
   * case below pins one thing that snapshot must do.
   */
  describe('opened mid-turn', () => {
    it('the snapshot alone opens the stream with the partial reply', async () => {
      const { viewer } = await openedMidTurn({ text: 'partial from snapshot' })
      const chunk = await nextRequest(viewer.inbox, chatResponseContaining('partial from snapshot'))
      expect(chunk.type).toBe('cf_agent_use_chat_response')
    })

    it('the viewer sees the turn as running', async () => {
      const { viewer, turnId } = await openedMidTurn({ text: 'partial' })
      await nextRequest(
        viewer.inbox,
        stateFrameWhere((s) => s.runningTurnId === turnId),
      )
    })

    it('the partial reasoning replays as reasoning, not as text', async () => {
      const { viewer } = await openedMidTurn({ reasoning: 'thinking hard', text: 'partial' })
      const chunk = await nextRequest(viewer.inbox, chatResponseContaining('thinking hard'))
      expect(chunk.body).toContain('reasoning-delta')
    })

    it('a live delta continues the same stream', async () => {
      const { flow, viewer, turnId } = await openedMidTurn({ text: 'partial' })
      await nextRequest(viewer.inbox, chatResponseContaining('partial'))
      flow.eventSender()(delta(turnId, ' then live'))
      await nextRequest(viewer.inbox, chatResponseContaining(' then live'))
    })

    it('with no reply yet, the first live delta is the first thing streamed', async () => {
      const { flow, viewer, turnId } = await openedMidTurn({})
      await nextRequest(
        viewer.inbox,
        stateFrameWhere((s) => s.runningTurnId === turnId),
      )
      flow.eventSender()(
        { type: 'message.started', turnId, messageId: assistantId(turnId), role: 'assistant' },
        delta(turnId, 'first live words'),
      )
      await nextRequest(viewer.inbox, chatResponseContaining('first live words'))
    })

    it('the reconcile at turn.finished leaves one user row and one assistant row', async () => {
      const { flow, viewer, turnId } = await openedMidTurn({ text: 'partial' })
      await nextRequest(viewer.inbox, chatResponseContaining('partial'))
      flow.eventSender()(delta(turnId, ' then live'))
      await flow.host.finishTurn(turnId, 'from the terminal', 'partial then live')
      await vi.waitFor(async () => {
        const rows = await flow.messages()
        expect(rows.map((row) => `${row.role} ${row.id}`)).toEqual([
          `user ${turnId}:user`,
          `assistant ${turnId}`,
        ])
        expect(JSON.stringify(rows[1]?.parts)).toContain('partial then live')
      })
    })

    it('stop from the phone cancels the terminal turn', async () => {
      const { flow, viewer, turnId } = await openedMidTurn({ text: 'partial' })
      await nextRequest(viewer.inbox, chatResponseContaining('partial'))
      const stop = flow.call('cancelTurn', { turnId })
      const cancel = await flow.nextDataRequest('turn.cancel')
      expect(z.object({ turnId: z.string() }).parse(cancel.params).turnId).toBe(turnId)
      flow.data.socket.send(JSON.stringify({ jsonrpc: '2.0', id: cancel.id, result: null }))
      await flow.host.finishTurn(turnId, 'from the terminal', 'partial', { type: 'cancelled' })
      await stop
      await vi.waitFor(async () => {
        const rows = await flow.messages()
        expect(rows.filter((row) => row.role === 'assistant')).toHaveLength(1)
      })
    })

    it('a permission the snapshot carries shows on the phone', async () => {
      const permissionId = PermissionIdSchema.parse(`${turnIdFor(conversation.id, 0)}:permission:1`)
      const { viewer } = await openedMidTurn({
        text: 'about to run it',
        pending: {
          permissions: [
            {
              permissionId,
              turnId: turnIdFor(conversation.id, 0),
              toolCallId: ToolCallIdSchema.parse('call-1'),
              title: 'Execute `git stash list`',
              options: [{ optionId: 'allow-once', name: 'Yes', kind: 'allow_once' }],
            },
          ],
          elicitations: [],
        },
      })
      const asked = await nextRequest(
        viewer.inbox,
        stateFrameWhere((s) => s.pending.permissions.length === 1),
      )
      expect(asked.pending.permissions[0]).toMatchObject({ toolCallId: 'call-1' })
    })
  })

  it('shows a permission the terminal was asked and clears it once answered elsewhere', async () => {
    const flow = await openConversation()
    const viewer = await flow.viewer()
    const turnId = turnIdFor(conversation.id, 0)
    const permissionId = PermissionIdSchema.parse(`${turnId}:permission:1`)
    const send = flow.eventSender()
    send({ type: 'turn.started', turnId, attemptId: createAttemptId() })
    send(userEcho(turnId, ''))
    send({
      type: 'permission.requested',
      turnId,
      permissionId,
      toolCallId: ToolCallIdSchema.parse('call-1'),
      title: 'Execute `git stash list`',
      options: [{ optionId: 'allow-once', name: 'Yes', kind: 'allow_once' }],
    })
    const asked = await nextRequest(
      viewer.inbox,
      stateFrameWhere((s) => s.pending.permissions.length === 1),
    )
    expect(asked.pending.permissions[0]).toMatchObject({ toolCallId: 'call-1' })

    // The terminal answered first; the card must go without a browser decision.
    send({
      type: 'permission.resolved',
      turnId,
      permissionId,
      outcome: { type: 'answered-elsewhere' },
    })
    await nextRequest(
      viewer.inbox,
      stateFrameWhere((s) => s.pending.permissions.length === 0),
    )
  })
})

/** One text chunk of the user message the Host echoed for an observed turn. */
function userDelta(turnId: TurnId, text: string): ConversationEvent {
  // SAFETY: same boundary rule as `delta`.
  return {
    type: 'message.delta',
    turnId,
    messageId: `${turnId}:user`,
    content: { type: 'text', text },
  } as ConversationEvent
}

function userCompleted(turnId: TurnId): ConversationEvent {
  // SAFETY: same boundary rule as `delta`.
  return { type: 'message.completed', turnId, messageId: `${turnId}:user` } as ConversationEvent
}

/** The SDK stream frame a viewer receives; matched only when its body carries `text`. */
function chatResponseContaining(text: string) {
  const schema = z.object({ type: z.literal('cf_agent_use_chat_response'), body: z.string() })
  return {
    safeParse: (value: unknown) => {
      const parsed = schema.safeParse(value)
      return parsed.success && parsed.data.body.includes(text)
        ? parsed
        : { success: false as const }
    },
  }
}

const StateFrameSchema = z.object({
  type: z.literal('cf_agent_state'),
  state: z.object({
    runningTurnId: z.string().optional(),
    pending: z.object({ permissions: z.array(z.object({ toolCallId: z.string() })) }),
  }),
})

type LiveStateFrame = z.infer<typeof StateFrameSchema>['state']

/** The SDK live-state frame a viewer receives; matched only when `predicate` holds. */
function stateFrameWhere(predicate: (state: LiveStateFrame) => boolean) {
  return {
    safeParse: (value: unknown): { success: true; data: LiveStateFrame } | { success: false } => {
      const parsed = StateFrameSchema.safeParse(value)
      if (!parsed.success || !predicate(parsed.data.state)) return { success: false }
      return { success: true, data: parsed.data.state }
    },
  }
}

/** What the browser hands `queueMessage`: the id it minted and the parts it typed. */
function queued(id: string, text: string) {
  return { id: MessageIdSchema.parse(id), parts: [{ type: 'text' as const, text }] }
}

function queuedTexts(rows: readonly UIMessage[]): string[] {
  return queuedRows(rows).map((row) =>
    row.parts.map((part) => (part.type === 'text' ? part.text : '')).join(''),
  )
}

function userText(params: z.infer<typeof TurnStartParamsSchema>): string {
  return params.userMessage.content
    .map((content) => (content.type === 'text' ? content.text : ''))
    .join('')
}

describe('ConversationAgent diff callables', () => {
  const uncommitted = {
    branch: 'main',
    files: [{ kind: 'text', path: 'src/a.ts', status: 'modified', added: 2, removed: 1 }],
  }

  it('reads the uncommitted changes from the Host on each call, nothing cached', async () => {
    const flow = await openConversation()
    const first = flow.call('listChanges')
    const request = await flow.nextDataRequest('changes.list')
    flow.data.socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: uncommitted }))
    await expect(first).resolves.toEqual(uncommitted)

    const second = flow.call('listChanges')
    const again = await flow.nextDataRequest('changes.list')
    flow.data.socket.send(
      JSON.stringify({ jsonrpc: '2.0', id: again.id, result: { branch: 'main', files: [] } }),
    )
    await expect(second).resolves.toEqual({ branch: 'main', files: [] })
  })

  it('reads one diff by path', async () => {
    const flow = await openConversation()
    const call = flow.call('getDiff', { path: ChangedFilePathSchema.parse('src/a.ts') })
    const request = await flow.nextDataRequest('changes.diff')
    expect(request.params).toEqual({ path: 'src/a.ts' })
    flow.data.socket.send(
      JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { kind: 'patch', patch: '+a\n' } }),
    )
    await expect(call).resolves.toEqual({ kind: 'patch', patch: '+a\n' })
  })
})

describe('ConversationAgent through its facet, pending seams', () => {
  it.todo(
    'holds one full assistant row after a facet restart mid-turn (needs a facet restart seam)',
  )
})

const TurnStartParamsSchema = z.object({
  attemptId: AttemptIdSchema,
  userMessage: z.object({
    id: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  }),
})

function assistantId(turnId: TurnId): MessageId {
  return MessageIdSchema.parse(`${turnId}:assistant:1`)
}

function delta(turnId: TurnId, text: string): ConversationEvent {
  // SAFETY: the test builds the event the Host would; the relay re-parses it at the boundary.
  return {
    type: 'message.delta',
    turnId,
    messageId: assistantId(turnId),
    content: { type: 'text', text },
  } as ConversationEvent
}

function userEcho(turnId: TurnId, text: string): ConversationEvent {
  // SAFETY: same boundary rule as `delta`.
  return {
    type: 'message.started',
    turnId,
    messageId: `${turnId}:user`,
    role: 'user',
  } as ConversationEvent
}

/** What `turn.get` answers: one turn's slice, `{ turnId, items, tools }`. */
function turnSlice(turnId: TurnId, text: string, userText = 'hi') {
  const { items, tools } = finishedTurn(turnId, userText, text)
  return { turnId, items, tools }
}

/**
 * A viewer opens the conversation while the terminal's first turn runs: the Host
 * socket answers `conversation.get` with `turn: running` and whatever the reply
 * holds so far. Returns the flow, the viewer, and the running turn's id.
 */
async function openedMidTurn(reply: {
  reasoning?: string
  text?: string
  pending?: ConversationState['pending']
}) {
  const flow = await openConversation()
  const viewer = await flow.viewer()
  const turnId = turnIdFor(conversation.id, 0)
  const attemptId = createAttemptId()
  const reconnected = await flow.reconnectData()
  const get = await flow.nextDataRequest('conversation.get')
  const base = finishedTurn(turnId, 'from the terminal', reply.text ?? '')
  const reasoning: ConversationState['items'] =
    reply.reasoning === undefined
      ? []
      : [
          {
            type: 'reasoning',
            turnId,
            messageId: MessageIdSchema.parse(`${turnId}:reasoning:1`),
            content: [{ type: 'text', text: reply.reasoning }],
          },
        ]
  const result: ConversationState = {
    ...base,
    // Reasoning sits between the user row and the assistant row, as the Host records it.
    items: [base.items[0], ...reasoning, ...base.items.slice(1)].filter(
      (item): item is ConversationState['items'][number] => item !== undefined,
    ),
    turn: { state: 'running', turnId, attemptId },
    pending: reply.pending ?? base.pending,
  }
  reconnected.socket.send(JSON.stringify({ jsonrpc: '2.0', id: get.id, result }))
  return { flow, viewer, turnId }
}

function finishedTurn(turnId: TurnId, userText: string, assistantText: string) {
  return {
    turn: { state: 'idle' },
    items: [
      {
        type: 'message',
        turnId,
        messageId: `${turnId}:user`,
        role: 'user',
        content: [{ type: 'text', text: userText }],
      },
      ...(assistantText === ''
        ? []
        : [
            {
              type: 'message',
              turnId,
              messageId: assistantId(turnId),
              role: 'assistant',
              content: [{ type: 'text', text: assistantText }],
            },
          ]),
    ],
    tools: [],
    plans: [],
    pending: { permissions: [], elicitations: [] },
  }
}

function chatRequest(requestId: string, messageId: string, text: string): string {
  return JSON.stringify({
    type: 'cf_agent_use_chat_request',
    id: requestId,
    init: {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          { id: messageId, role: 'user', parts: [{ type: 'text', text }] },
        ] satisfies UIMessage[],
      }),
    },
  })
}

/** Control + data Host sockets around one conversation, snapshot answered idle. */
async function openConversation() {
  const hostId = createHostId()
  const stub = relayStub(hostId)
  const control = await connectSocket(stub, hostId, 'https://relay.test', HOST_CONTROL_SUBPROTOCOL)
  const list = await nextRequest(control.inbox, hostControlRequestSchema('conversations.list'))
  control.socket.send(
    JSON.stringify({ jsonrpc: '2.0', id: list.id, result: { conversations: [conversation] } }),
  )
  await vi.waitFor(async () => {
    expect((await stub.readConversations({ limit: 50 })).conversations).toHaveLength(1)
  })

  const dataUrl = `https://relay.test/sub/conversation-agent/${conversation.id}`
  let data = await connectSocket(stub, hostId, dataUrl, HOST_CONVERSATION_SUBPROTOCOL)
  let seq = 0
  let turnIndex = 0
  const get = await nextRequest(data.inbox, hostConversationRequestSchema('conversation.get'))
  data.socket.send(JSON.stringify({ jsonrpc: '2.0', id: get.id, result: idleState }))
  let rpcViewer: { socket: WebSocket; inbox: SocketInbox } | undefined
  let rpcId = 0

  const flow = {
    get data() {
      return data
    },
    /**
     * A callable, the way the browser stub reaches it: an RPC frame on a viewer
     * socket. Worker RPC would return before the drain runs and take its I/O
     * context with it; the socket's message context is what production has.
     */
    async call<Method extends CallableName>(
      method: Method,
      ...args: Parameters<ConversationAgent[Method]>
    ): Promise<unknown> {
      rpcViewer ??= await flow.viewer()
      rpcId += 1
      const id = `rpc-${String(rpcId)}`
      rpcViewer.socket.send(JSON.stringify({ type: 'rpc', id, method, args }))
      const response = await nextRequest(rpcViewer.inbox, {
        safeParse: (value: unknown) => {
          const parsed = RpcResponseSchema.safeParse(value)
          return parsed.success && parsed.data.id === id ? parsed : { success: false as const }
        },
      })
      if (!response.success) throw new Error(response.error)
      return response.result
    },
    /** The scripted machine: each call is one thing the real Host does. */
    host: {
      /** Answer the next `turn.start`: mint the turn id, echo the user row, accept. */
      async startTurn() {
        const start = await flow.nextDataRequest('turn.start')
        const params = TurnStartParamsSchema.parse(start.params)
        const turnId = turnIdFor(conversation.id, turnIndex)
        turnIndex += 1
        const send = flow.eventSender()
        send({ type: 'turn.started', turnId, attemptId: params.attemptId })
        send(userEcho(turnId, ''))
        data.socket.send(JSON.stringify({ jsonrpc: '2.0', id: start.id, result: null }))
        return { turnId, params }
      },
      /** One assistant message, streamed as the Host would. */
      stream(turnId: TurnId, text: string) {
        const send = flow.eventSender()
        send({ type: 'message.started', turnId, messageId: assistantId(turnId), role: 'assistant' })
        send(delta(turnId, text))
        send({ type: 'message.completed', turnId, messageId: assistantId(turnId) })
      },
      /** End the turn and answer the reconcile that follows. */
      async finishTurn(
        turnId: TurnId,
        userText: string,
        assistantText: string,
        outcome: { type: 'completed'; reason: 'completed' } | { type: 'cancelled' } = {
          type: 'completed',
          reason: 'completed',
        },
      ) {
        flow.eventSender()({ type: 'turn.finished', turnId, outcome })
        const turnGet = await flow.nextDataRequest('turn.get')
        data.socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: turnGet.id,
            result: turnSlice(turnId, assistantText, userText),
          }),
        )
      },
      /** The relay must stay quiet: any Host request in the window is a failure. */
      async expectNoRequestFor(ms: number) {
        const frame = await data.inbox.nextWithin(ms)
        expect(frame).toBeUndefined()
      },
      /** Methods of the JSON-RPC requests that reach the Host within `ms` of silence. */
      async requestsWithin(ms: number): Promise<string[]> {
        const methods: string[] = []
        for (let frame = await data.inbox.nextWithin(ms); frame !== undefined;) {
          const parsed = z.object({ method: z.string() }).safeParse(JSON.parse(frame))
          if (parsed.success) methods.push(parsed.data.method)
          // oxlint-disable-next-line no-await-in-loop -- Frames arrive one at a time.
          frame = await data.inbox.nextWithin(ms)
        }
        return methods
      },
    },
    /** The `seq` of the last event sent on the current Host socket. */
    lastSeq: () => seq,
    eventSender() {
      return (...events: readonly ConversationEvent[]) => {
        const frames = events.map((event) => {
          seq += 1
          return JSON.stringify(jsonRpcNotification('conversation.event', { seq, event }))
        })
        // Deliberately send the batch in reverse to exercise in-order apply.
        for (const frame of [...frames].reverse()) data.socket.send(frame)
      }
    },
    async nextDataRequest<Method extends HostConversationRequestMethod>(method: Method) {
      return nextRequest(data.inbox, hostConversationRequestSchema(method))
    },
    async reconnectData() {
      // The real Host closes its old socket before reconnecting; mirror that.
      data.socket.close(1000, 'reconnect')
      data = await connectSocket(stub, hostId, dataUrl, HOST_CONVERSATION_SUBPROTOCOL)
      seq = 0
      return data
    },
    async viewer() {
      const response = await stub.fetch(dataUrl, { headers: { Upgrade: 'websocket' } })
      if (response.webSocket === null) throw new Error('Expected a viewer WebSocket')
      const inbox = new SocketInbox(response.webSocket)
      response.webSocket.accept()
      openSockets.push(response.webSocket)
      // No attach request follows: the Host data socket is already connected.
      return { socket: response.webSocket, inbox }
    },
    agent: () => getSubAgentByName(stub, ConversationAgent, conversation.id),
    // The production read: Worker RPC through the parent, not the SDK's `/get-messages`.
    async messages(): Promise<UIMessage[]> {
      const agent = await getSubAgentByName(stub, ConversationAgent, conversation.id)
      return agent.readMessages()
    },
  }
  return flow
}

function relayStub(hostId: HostId) {
  const relays = env.HOST_RELAY_AGENT
  if (relays === undefined) throw new Error('HOST_RELAY_AGENT is not bound')
  return relays.getByName(hostId)
}

async function connectSocket(
  stub: DurableObjectStub<HostRelayAgent>,
  hostId: HostId,
  url: string,
  subprotocol: string,
) {
  const response = await stub.fetch(url, {
    headers: {
      Upgrade: 'websocket',
      'Sec-WebSocket-Protocol': subprotocol,
      [RELAY_HOST_ID_HEADER]: hostId,
    },
  })
  if (response.webSocket === null) throw new Error('Expected a WebSocket response')
  const inbox = new SocketInbox(response.webSocket)
  response.webSocket.accept()
  openSockets.push(response.webSocket)
  return { socket: response.webSocket, inbox }
}

type CallableName =
  | 'queueMessage'
  | 'withdrawQueued'
  | 'reorderQueued'
  | 'sendQueuedNow'
  | 'cancelTurn'
  | 'listChanges'
  | 'getDiff'

/** The SDK's answer to one RPC frame (`agents` wire types, not exported). */
const RpcResponseSchema = z.discriminatedUnion('success', [
  z.object({
    type: z.literal('rpc'),
    id: z.string(),
    success: z.literal(true),
    result: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('rpc'),
    id: z.string(),
    success: z.literal(false),
    error: z.string(),
  }),
])

/** The SDK frame that seeds and replaces a browser's transcript. */
const ChatMessagesFrameSchema = z.object({
  type: z.literal('cf_agent_chat_messages'),
  messages: z.array(z.object({ id: z.string(), role: z.string() })),
})

async function nextRequest<Result>(
  inbox: SocketInbox,
  schema: { safeParse: (value: unknown) => { success: true; data: Result } | { success: false } },
): Promise<Result> {
  for (;;) {
    const parsed = schema.safeParse(JSON.parse(await inbox.next()))
    if (parsed.success) return parsed.data
  }
}

class SocketInbox {
  private readonly frames: string[] = []
  private readonly readers: Array<(frame: string) => void> = []

  constructor(socket: WebSocket) {
    socket.addEventListener('message', (event) => this.push(String(event.data)))
  }

  next(): Promise<string> {
    const frame = this.frames.shift()
    return frame === undefined
      ? new Promise((resolve) => this.readers.push(resolve))
      : Promise.resolve(frame)
  }

  /** The next frame, or undefined when none arrives in time. A frame that arrives is consumed. */
  nextWithin(ms: number): Promise<string | undefined> {
    const frame = this.frames.shift()
    if (frame !== undefined) return Promise.resolve(frame)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = this.readers.indexOf(reader)
        if (index !== -1) this.readers.splice(index, 1)
        resolve(undefined)
      }, ms)
      const reader = (next: string) => {
        clearTimeout(timer)
        resolve(next)
      }
      this.readers.push(reader)
    })
  }

  private push(frame: string): void {
    const reader = this.readers.shift()
    if (reader === undefined) this.frames.push(frame)
    else reader(frame)
  }
}
