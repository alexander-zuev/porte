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
import type { HostRelayAgent } from '@server/infrastructure/durable-objects/host-relay-agent.ts'
import { RELAY_HOST_ID_HEADER } from '@server/infrastructure/durable-objects/relay/relay-headers.ts'
import type { UIMessage } from 'ai'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { applyDatabaseTestMigrations } from './database-test-migrations.ts'

/**
 * The seams the spikes could not settle by reading (plan §10), driven through
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
    // The store must not gain a second version of the streaming turn (plan §5.2).
    const reconnected = await flow.reconnectData()
    const get = await flow.nextDataRequest('conversation.get')
    reconnected.socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: get.id,
        result: {
          ...finishedTurn(turnId, 'partial'),
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

  it.todo(
    'holds one full assistant row after a facet restart mid-turn (needs a facet restart seam)',
  )
})

const TurnStartParamsSchema = z.object({
  attemptId: AttemptIdSchema,
  userMessage: z.object({ id: z.string() }),
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
function turnSlice(turnId: TurnId, text: string) {
  const { items, tools } = finishedTurn(turnId, text)
  return { turnId, items, tools }
}

function finishedTurn(turnId: TurnId, text: string) {
  return {
    turn: { state: 'idle' },
    items: [
      {
        type: 'message',
        turnId,
        messageId: `${turnId}:user`,
        role: 'user',
        content: [{ type: 'text', text: 'hi' }],
      },
      {
        type: 'message',
        turnId,
        messageId: assistantId(turnId),
        role: 'assistant',
        content: [{ type: 'text', text }],
      },
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
  const get = await nextRequest(data.inbox, hostConversationRequestSchema('conversation.get'))
  data.socket.send(JSON.stringify({ jsonrpc: '2.0', id: get.id, result: idleState }))

  const flow = {
    get data() {
      return data
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
    async messages(): Promise<UIMessage[]> {
      const response = await stub.fetch(`${dataUrl}/get-messages`)
      if (!response.ok) throw new Error(`get-messages failed: ${String(response.status)}`)
      // SAFETY: our own ConversationAgent wrote this JSON from `UIMessage[]` in the same deploy.
      return (await response.json()) as UIMessage[]
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

  private push(frame: string): void {
    const reader = this.readers.shift()
    if (reader === undefined) this.frames.push(frame)
    else reader(frame)
  }
}
