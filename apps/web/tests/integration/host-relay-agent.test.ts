import {
  ConversationEventSchema,
  ConversationIdSchema,
  IsoDateTimeSchema,
  RelayToHostMessageSchema,
  createHostId,
  createMessageId,
  createOperationId,
  createPermissionId,
  createTurnId,
  type ConversationSummary,
  type HostCommand,
  type HostId,
} from '@porte/core'
import type { HostRelayAgent } from '@server/infrastructure/durable-objects/host-relay-agent.ts'
import {
  RELAY_HOST_ID_HEADER,
  RELAY_ROLE_HEADER,
} from '@server/infrastructure/durable-objects/relay/relay-headers.ts'
import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { applyDatabaseTestMigrations } from './database-test-migrations.ts'

const conversationId = ConversationIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca69580001fd')
const turnId = createTurnId()
const userMessageId = createMessageId()
const permissionId = createPermissionId()
const RpcResponseSchema = z.object({
  type: z.literal('rpc'),
  id: z.string(),
  success: z.boolean(),
  result: z.unknown().optional(),
})

beforeAll(applyDatabaseTestMigrations)

describe('HostRelayAgent', () => {
  it('publishes liveness from the accepted Mac connection', async () => {
    const hostId = createHostId()
    const { inbox, socket, stub } = await connect(hostId)
    await settleCatalog(inbox, socket)

    expect(await stub.readStatus()).toMatchObject({ status: 'online' })
    socket.send('ping')
    expect(await inbox.next()).toBe('pong')
    socket.close(1000, 'test complete')
    await vi.waitFor(async () =>
      expect(await stub.readStatus()).toMatchObject({ status: 'offline' }),
    )
  })

  it('rejects a Mac identity that differs from the Agent name', async () => {
    const hostId = createHostId()
    const { inbox } = await connect(hostId, createHostId())

    expect((await inbox.closed()).code).toBe(1008)
  })

  it('returns the durable result for a repeated start command', async () => {
    const hostId = createHostId()
    const { inbox, socket, stub } = await connect(hostId)
    await settleCatalog(inbox, socket)
    const operationId = createOperationId()
    const call = startCall(operationId)
    const first = stub.startTurn(call)
    expect((await nextCommand(inbox)).operationId).toBe(operationId)
    socket.send(JSON.stringify({ v: 2, type: 'command.result', operationId, result: { turnId } }))
    expect(await first).toMatchObject({ success: true, data: { turnId } })

    expect(await stub.startTurn(call)).toMatchObject({ success: true, data: { turnId } })
    socket.close(1000, 'test complete')
  })

  it('replays a pending command after the Mac reconnects', async () => {
    const hostId = createHostId()
    const first = await connect(hostId)
    await settleCatalog(first.inbox, first.socket)
    const operationId = createOperationId()
    const waiting = first.stub.startTurn(startCall(operationId))
    expect((await nextCommand(first.inbox)).operationId).toBe(operationId)
    first.socket.close(1011, 'connection lost')
    expect(await waiting).toMatchObject({
      success: false,
      error: { _tag: 'HostOfflineError' },
    })

    const second = await connect(hostId)
    await settleCatalog(second.inbox, second.socket)
    expect((await nextCommand(second.inbox)).operationId).toBe(operationId)
    const repeated = second.stub.startTurn(startCall(operationId))
    second.socket.send(
      JSON.stringify({ v: 2, type: 'command.result', operationId, result: { turnId } }),
    )
    expect(await repeated).toMatchObject({ success: true, data: { turnId } })
    second.socket.close(1000, 'test complete')
  })

  it('starts a fresh catalog sync after an interrupted sync reconnects', async () => {
    const hostId = createHostId()
    const first = await connect(hostId)
    const interrupted = await nextCommand(first.inbox)
    expect(interrupted.method).toBe('conversations.sync')
    first.socket.close(1011, 'sync interrupted')

    const second = await connect(hostId)
    const fresh = await nextCommand(second.inbox)
    expect(fresh.method).toBe('conversations.sync')
    expect(fresh.operationId).not.toBe(interrupted.operationId)

    second.socket.send(
      JSON.stringify({
        v: 2,
        type: 'conversations.sync',
        operationId: fresh.operationId,
        conversations: [],
        done: true,
        activeTurns: [],
      }),
    )
    second.socket.send(
      JSON.stringify({
        v: 2,
        type: 'command.result',
        operationId: fresh.operationId,
        result: { eventHeads: {} },
      }),
    )
    const replayed = await nextCommand(second.inbox)
    expect(replayed.operationId).toBe(interrupted.operationId)
    second.socket.send(
      JSON.stringify({
        v: 2,
        type: 'command.result',
        operationId: replayed.operationId,
        result: { eventHeads: {} },
      }),
    )
    second.socket.close(1000, 'test complete')
  })

  it('acknowledges an event after the child stores it', async () => {
    const hostId = createHostId()
    const { inbox, socket } = await connect(hostId)
    await settleCatalog(inbox, socket)
    const event = ConversationEventSchema.parse({
      type: 'turn.started',
      turnId,
    })
    socket.send(
      JSON.stringify({
        v: 2,
        type: 'conversation.event',
        conversationId,
        eventSequence: 1,
        event,
      }),
    )

    expect(RelayToHostMessageSchema.parse(JSON.parse(await inbox.next()))).toEqual({
      v: 2,
      type: 'event.ack',
      conversationId,
      throughEventSequence: 1,
    })
    socket.send(
      JSON.stringify({
        v: 2,
        type: 'conversation.snapshot',
        conversationId,
        throughEventSequence: 2,
        snapshot: idleState,
      }),
    )
    expect(RelayToHostMessageSchema.parse(JSON.parse(await inbox.next()))).toMatchObject({
      type: 'event.ack',
      throughEventSequence: 2,
    })
    socket.close(1000, 'test complete')
  })

  it('publishes minimal activity without opening a child Agent', async () => {
    const host = await connect(createHostId())
    await settleCatalog(host.inbox, host.socket)

    await sendEvent(host, 1, { type: 'turn.started', turnId })
    expect(await readActivity(host.stub)).toEqual([
      { conversationId, turnId, hasAssistantMessage: false },
    ])

    await sendEvent(host, 2, {
      type: 'message.started',
      turnId,
      messageId: createMessageId(),
      role: 'assistant',
    })
    expect(await readActivity(host.stub)).toEqual([
      { conversationId, turnId, hasAssistantMessage: true },
    ])

    await sendEvent(host, 3, {
      type: 'turn.finished',
      turnId,
      outcome: { type: 'completed', reason: 'completed' },
    })
    expect(await readActivity(host.stub)).toEqual([])
    host.socket.close(1000, 'test complete')
  })

  it('keeps the Mac connection open after the browser cancels a turn', async () => {
    const hostId = createHostId()
    const host = await connect(hostId)
    await authorizeChild(host)
    const child = await openChild(hostId)
    child.socket.send(
      JSON.stringify({
        type: 'cf_agent_use_chat_request',
        id: turnId,
        init: {
          method: 'POST',
          body: JSON.stringify({
            messages: [
              { id: userMessageId, role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
            ],
          }),
        },
      }),
    )
    const start = await nextCommandWithMethod(host.inbox, 'turn.start')
    expect(start.method).toBe('turn.start')
    host.socket.send(
      JSON.stringify({
        v: 2,
        type: 'command.result',
        operationId: start.operationId,
        result: { turnId },
      }),
    )

    child.socket.send(JSON.stringify({ type: 'cf_agent_chat_request_cancel', id: turnId }))
    const cancel = await nextCommand(host.inbox)
    expect(cancel.method).toBe('turn.cancel')
    host.socket.send(
      JSON.stringify({
        v: 2,
        type: 'command.result',
        operationId: cancel.operationId,
        result: { turnId },
      }),
    )
    host.socket.send(
      JSON.stringify({
        v: 2,
        type: 'conversation.event',
        conversationId,
        eventSequence: 1,
        event: {
          type: 'turn.finished',
          turnId,
          outcome: { type: 'completed', reason: 'completed' },
        },
      }),
    )

    expect(RelayToHostMessageSchema.parse(JSON.parse(await host.inbox.next()))).toMatchObject({
      type: 'event.ack',
      throughEventSequence: 1,
    })
    expect(await host.stub.readStatus()).toEqual({ status: 'online' })
    child.socket.close(1000, 'test complete')
    host.socket.close(1000, 'test complete')
  })

  it('replays a cancel that the child stores while the Mac is offline', async () => {
    const hostId = createHostId()
    const host = await connect(hostId)
    await authorizeChild(host)
    const child = await openChild(hostId)
    child.socket.send(
      JSON.stringify({
        type: 'cf_agent_use_chat_request',
        id: turnId,
        init: {
          method: 'POST',
          body: JSON.stringify({
            messages: [
              { id: userMessageId, role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
            ],
          }),
        },
      }),
    )
    const start = await nextCommandWithMethod(host.inbox, 'turn.start')
    host.socket.send(
      JSON.stringify({
        v: 2,
        type: 'command.result',
        operationId: start.operationId,
        result: { turnId },
      }),
    )
    host.socket.close(1011, 'host offline')
    await vi.waitFor(async () =>
      expect(await host.stub.readStatus()).toMatchObject({ status: 'offline' }),
    )

    child.socket.send(JSON.stringify({ type: 'cf_agent_chat_request_cancel', id: turnId }))
    const reconnected = await connect(hostId)
    const cancel = await nextCommandWithMethod(reconnected.inbox, 'turn.cancel')
    expect(cancel).toMatchObject({ method: 'turn.cancel', params: { conversationId, turnId } })
    reconnected.socket.close(1000, 'test complete')
    child.socket.close(1000, 'test complete')
  })

  it('deletes a child when the Mac removes its conversation', async () => {
    const hostId = createHostId()
    const host = await connect(hostId)
    await authorizeChild(host)
    const child = await openChild(hostId)

    host.socket.send(JSON.stringify({ v: 2, type: 'conversation.removed', conversationId }))

    await vi.waitFor(async () => expect((await childUpgrade(hostId)).status).toBe(404))
    child.socket.close(1000, 'test complete')
    host.socket.close(1000, 'test complete')
  })

  it('expires the cached catalog and child state while the Mac is offline', async () => {
    const hostId = createHostId()
    const host = await connect(hostId)
    await authorizeChild(host)
    host.socket.close(1000, 'host offline')
    await vi.waitFor(async () =>
      expect(await host.stub.readStatus()).toMatchObject({ status: 'offline' }),
    )

    await host.stub.expireCatalog()

    expect(await host.stub.readConversations({ cursor: null, limit: 50 })).toEqual({
      conversations: [],
      next: null,
    })
    expect((await childUpgrade(hostId)).status).toBe(404)
  })

  it('exposes permission answers through parent callable RPC', async () => {
    const hostId = createHostId()
    const host = await connect(hostId)
    await authorizeChild(host)
    host.socket.close(1000, 'catalog ready')
    await vi.waitFor(async () =>
      expect(await host.stub.readStatus()).toMatchObject({ status: 'offline' }),
    )
    const browser = await openRoot(hostId)
    browser.socket.send(
      JSON.stringify({
        type: 'rpc',
        id: 'permission-call',
        method: 'answerPermission',
        args: [{ conversationId, turnId, permissionId, optionId: 'allow' }],
      }),
    )

    expect(await nextRpcResponse(browser.inbox, 'permission-call')).toMatchObject({
      success: true,
      result: { type: 'command.error', error: { _tag: 'HostOfflineError' } },
    })
    browser.socket.close(1000, 'test complete')
  })

  it('rejects a child without a successful transcript read', async () => {
    const response = await relayStub(createHostId()).fetch(
      `https://relay.test/sub/conversation-agent/${conversationId}`,
      { headers: { Upgrade: 'websocket' } },
    )

    expect(response.status).toBe(404)
  })
})

function relayStub(hostId: HostId) {
  const relays = env.HOST_RELAY_AGENT
  if (relays === undefined) throw new Error('HOST_RELAY_AGENT is not bound')
  return relays.getByName(hostId)
}

async function connect(hostId: HostId, headerHostId: HostId = hostId) {
  const stub = relayStub(hostId)
  const response = await stub.fetch('https://relay.test', {
    headers: {
      Upgrade: 'websocket',
      [RELAY_ROLE_HEADER]: 'daemon',
      [RELAY_HOST_ID_HEADER]: headerHostId,
    },
  })
  if (response.webSocket === null) throw new Error('Expected a WebSocket response')
  const inbox = new SocketInbox(response.webSocket)
  response.webSocket.accept()
  return { inbox, socket: response.webSocket, stub }
}

async function authorizeChild(host: Awaited<ReturnType<typeof connect>>): Promise<void> {
  await settleCatalog(host.inbox, host.socket, [conversationSummary])
  const read = host.stub.readConversation({ conversationId, cursor: null, limit: 200 })
  const command = await nextCommand(host.inbox)
  expect(command.method).toBe('conversation.read')
  host.socket.send(
    JSON.stringify({
      v: 2,
      type: 'command.result',
      operationId: command.operationId,
      result: {
        conversation: conversationSummary,
        events: [],
        next: null,
        state: idleState,
      },
    }),
  )
  await read
}

async function openChild(hostId: HostId) {
  const response = await childUpgrade(hostId)
  if (response.webSocket === null) throw new Error('Expected a child WebSocket response')
  const inbox = new SocketInbox(response.webSocket)
  response.webSocket.accept()
  return { inbox, socket: response.webSocket }
}

async function openRoot(hostId: HostId) {
  const response = await relayStub(hostId).fetch('https://relay.test', {
    headers: { Upgrade: 'websocket' },
  })
  if (response.webSocket === null) throw new Error('Expected a root WebSocket response')
  const inbox = new SocketInbox(response.webSocket)
  response.webSocket.accept()
  return { inbox, socket: response.webSocket }
}

async function childUpgrade(hostId: HostId): Promise<Response> {
  return await relayStub(hostId).fetch(
    `https://relay.test/sub/conversation-agent/${conversationId}`,
    { headers: { Upgrade: 'websocket' } },
  )
}

async function settleCatalog(
  inbox: SocketInbox,
  socket: WebSocket,
  conversations: ConversationSummary[] = [],
): Promise<void> {
  const command = await nextCommand(inbox)
  expect(command.method).toBe('conversations.sync')
  socket.send(
    JSON.stringify({
      v: 2,
      type: 'conversations.sync',
      operationId: command.operationId,
      conversations,
      done: true,
      activeTurns: [],
    }),
  )
  socket.send(
    JSON.stringify({
      v: 2,
      type: 'command.result',
      operationId: command.operationId,
      result: { eventHeads: {} },
    }),
  )
}

const conversationSummary: ConversationSummary = {
  id: conversationId,
  cwd: '/workspace/porte',
  gitRoot: '/workspace/porte',
  title: 'Relay transport',
  updatedAt: IsoDateTimeSchema.parse('2026-08-23T00:00:00.000Z'),
}

async function nextCommand(inbox: SocketInbox): Promise<HostCommand> {
  for (;;) {
    const raw = await inbox.next()
    const frame = RelayToHostMessageSchema.safeParse(JSON.parse(raw))
    if (!frame.success) throw new Error(`Unexpected host frame: ${raw}`)
    if (frame.data.type === 'command') return frame.data
  }
}

async function nextCommandWithMethod(
  inbox: SocketInbox,
  method: HostCommand['method'],
): Promise<HostCommand> {
  for (;;) {
    const command = await nextCommand(inbox)
    if (command.method === method) return command
  }
}

async function nextRpcResponse(inbox: SocketInbox, id: string) {
  for (;;) {
    const response = RpcResponseSchema.safeParse(JSON.parse(await inbox.next()))
    if (response.success && response.data.id === id) return response.data
  }
}

async function readActivity(stub: ReturnType<typeof relayStub>) {
  return await runInDurableObject(stub, (relay: HostRelayAgent) => relay.state.activeConversations)
}

async function sendEvent(
  host: Awaited<ReturnType<typeof connect>>,
  eventSequence: number,
  event: Parameters<typeof ConversationEventSchema.parse>[0],
): Promise<void> {
  host.socket.send(
    JSON.stringify({
      v: 2,
      type: 'conversation.event',
      conversationId,
      eventSequence,
      event,
    }),
  )
  expect(RelayToHostMessageSchema.parse(JSON.parse(await host.inbox.next()))).toMatchObject({
    type: 'event.ack',
    throughEventSequence: eventSequence,
  })
}

function startCall(operationId: ReturnType<typeof createOperationId>) {
  return {
    operationId,
    params: {
      conversationId,
      turnId,
      userMessage: {
        id: userMessageId,
        content: [{ type: 'text' as const, text: 'Continue' }],
      },
    },
  }
}

const idleState = {
  turn: { state: 'idle' as const },
  plans: [],
  usage: null,
  configuration: null,
  commands: null,
  modeId: null,
  pending: { permissions: [], elicitations: [] },
}

class SocketInbox {
  private readonly frames: string[] = []
  private readonly readers: Array<(frame: string) => void> = []
  private readonly closePromise: Promise<CloseEvent>

  constructor(socket: WebSocket) {
    socket.addEventListener('message', (event) => this.push(String(event.data)))
    this.closePromise = new Promise((resolve) =>
      socket.addEventListener('close', resolve, { once: true }),
    )
  }

  next(): Promise<string> {
    const frame = this.frames.shift()
    return frame === undefined
      ? new Promise((resolve) => this.readers.push(resolve))
      : Promise.resolve(frame)
  }

  closed(): Promise<CloseEvent> {
    return this.closePromise
  }

  private push(frame: string): void {
    const reader = this.readers.shift()
    if (reader === undefined) this.frames.push(frame)
    else reader(frame)
  }
}
