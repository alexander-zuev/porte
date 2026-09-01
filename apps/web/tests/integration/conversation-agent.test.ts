import {
  AttemptIdSchema,
  ConversationIdSchema,
  HOST_CONTROL_SUBPROTOCOL,
  HOST_CONVERSATION_SUBPROTOCOL,
  IsoDateTimeSchema,
  MessageIdSchema,
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
import { beforeAll, describe, expect, it, vi } from 'vitest'
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
  it('queues while a turn runs and starts every queued message as one turn when it ends', async () => {
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
    const drained = await flow.host.startTurn()
    expect(drained.params.userMessage.id).toBe('q-1')
    expect(userText(drained.params)).toBe('second\n\nthird')
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
    await flow.host.finishTurn(first.turnId, 'first', '', { type: 'cancelled' })

    const started = await flow.host.startTurn()
    expect(userText(started.params)).toBe('second')
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
    expect(userText(started.params)).toBe('c\n\na')
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
})

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
    ): Promise<void> {
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
    },
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
      // No attach request follows: the Host data socket is already connected.
      return { socket: response.webSocket, inbox }
    },
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
  return { socket: response.webSocket, inbox }
}

type CallableName =
  | 'queueMessage'
  | 'withdrawQueued'
  | 'reorderQueued'
  | 'sendQueuedNow'
  | 'cancelTurn'

/** The SDK's answer to one RPC frame (`agents` wire types, not exported). */
const RpcResponseSchema = z.discriminatedUnion('success', [
  z.object({ type: z.literal('rpc'), id: z.string(), success: z.literal(true) }),
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
