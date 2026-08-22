import {
  ClientMessageSchema,
  ConversationIdSchema,
  IsoDateTimeSchema,
  RelayMessageSchema,
  RELAY_HEARTBEAT_REQUEST,
  RELAY_HEARTBEAT_RESPONSE,
  RequestMessageSchema,
  RoutedEventSchema,
  RoutedRequestSchema,
  RoutedResponseSchema,
  UserIdSchema,
  createHostId,
  createRequestId,
  makeConversationSummary,
} from '@porte/core'
import { Host } from '@server/domain/host/host.aggregate.ts'
import {
  RELAY_HOST_ID_HEADER,
  RELAY_ROLE_HEADER,
} from '@server/infrastructure/durable-objects/relay/relay-headers.ts'
import { createDatabase } from '@server/infrastructure/persistence/database/connection.ts'
import { user } from '@server/infrastructure/persistence/database/schema/auth.schema.ts'
import { DrizzleHostRepository } from '@server/infrastructure/persistence/repositories/host.repository.ts'
import { evictDurableObject, runInDurableObject, runDurableObjectAlarm } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { applyDatabaseTestMigrations } from './database-test-migrations.ts'

const HOST_ID = createHostId()
const CONVERSATION_ID = ConversationIdSchema.parse('conversation-1')
const PAGE_QUERY = { cursor: null, limit: 10 } as const
const SUMMARY_INPUT = {
  id: CONVERSATION_ID,
  cwd: '/Users/az/projects/porte',
  gitRoot: '/Users/az/projects/porte',
  title: 'Conversation',
  updatedAt: IsoDateTimeSchema.parse('2026-08-22T10:00:00.000Z'),
}
const SUMMARY = makeConversationSummary(SUMMARY_INPUT)

type RelayRole = 'client' | 'daemon'

function relayStub(name: string) {
  const relays = env.HOST_RELAY_DO
  if (relays === undefined) throw new Error('HOST_RELAY_DO is not bound')
  return relays.getByName(name)
}

async function connect(name: string, role: RelayRole) {
  const stub = relayStub(name)
  const response = await stub.fetch('https://relay.test', {
    headers: { Upgrade: 'websocket', [RELAY_ROLE_HEADER]: role, [RELAY_HOST_ID_HEADER]: HOST_ID },
  })
  const socket = response.webSocket
  if (socket === null) throw new Error('Expected a WebSocket response')
  socket.accept()
  return { socket, stub }
}

function nextMessage<T>(socket: WebSocket, schema: z.ZodType<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const onClose = () => reject(new Error('Socket closed before the expected message'))
    const onMessage = (event: MessageEvent) => {
      socket.removeEventListener('close', onClose)
      try {
        resolve(schema.parse(JSON.parse(z.string().parse(event.data))))
      } catch (error) {
        reject(error)
      }
    }
    socket.addEventListener('close', onClose, { once: true })
    socket.addEventListener('message', onMessage, { once: true })
  })
}

function nextClose(socket: WebSocket): Promise<CloseEvent> {
  return new Promise((resolve) => socket.addEventListener('close', resolve, { once: true }))
}

function nextText(socket: WebSocket): Promise<string> {
  return new Promise((resolve) =>
    socket.addEventListener('message', (event) => resolve(z.string().parse(event.data)), {
      once: true,
    }),
  )
}

function sendJson(socket: WebSocket, value: unknown): void {
  socket.send(JSON.stringify(value))
}

function syncFrame() {
  return RelayMessageSchema.parse({
    relay: 'conversations.sync',
    syncRunId: 'sync-1',
    conversations: [SUMMARY],
    done: true,
  })
}

function closeRequest() {
  return RequestMessageSchema.parse({
    v: 1,
    type: 'request',
    requestId: createRequestId(),
    method: 'conversation.close',
    params: { conversationId: CONVERSATION_ID },
  })
}

async function openConversation(client: WebSocket, daemon: WebSocket): Promise<void> {
  const request = RequestMessageSchema.parse({
    v: 1,
    type: 'request',
    requestId: createRequestId(),
    method: 'conversation.open',
    params: { conversationId: CONVERSATION_ID },
  })
  const routedPromise = nextMessage(daemon, RoutedRequestSchema)
  sendJson(client, request)
  const routed = await routedPromise
  const result = RoutedResponseSchema.parse({
    route: routed.route,
    method: 'conversation.open',
    message: {
      v: 1,
      type: 'result',
      requestId: routed.message.requestId,
      result: { conversation: SUMMARY, turn: { state: 'idle' } },
    },
  })
  const clientResult = nextMessage(client, ClientMessageSchema)
  sendJson(daemon, result)
  await clientResult
}

beforeAll(applyDatabaseTestMigrations)

afterEach(() => vi.restoreAllMocks())

describe('host relay durable object', () => {
  it('answers browser heartbeat across hibernation', async () => {
    const { socket, stub } = await connect('heartbeat', 'client')
    await nextMessage(socket, ClientMessageSchema)
    const first = nextText(socket)
    socket.send(RELAY_HEARTBEAT_REQUEST)
    expect(await first).toBe(RELAY_HEARTBEAT_RESPONSE)
    await evictDurableObject(stub)
    const second = nextText(socket)
    socket.send(RELAY_HEARTBEAT_REQUEST)
    expect(await second).toBe(RELAY_HEARTBEAT_RESPONSE)
    socket.close(1000, 'test complete')
  })

  it('reports offline, online, then offline', async () => {
    const { socket: client } = await connect('status', 'client')
    expect(await nextMessage(client, ClientMessageSchema)).toMatchObject({
      type: 'event',
      event: 'host.status',
      data: { status: 'offline' },
    })
    const online = nextMessage(client, ClientMessageSchema)
    const { socket: daemon } = await connect('status', 'daemon')
    expect(await online).toMatchObject({ data: { status: 'online' } })
    const offline = nextMessage(client, ClientMessageSchema)
    daemon.close(1000, 'test complete')
    expect(await offline).toMatchObject({ data: { status: 'offline' } })
    client.close(1000, 'test complete')
  })

  it('replaces the daemon without an offline transition', async () => {
    const { socket: client } = await connect('replacement', 'client')
    await nextMessage(client, ClientMessageSchema)
    const firstOnline = nextMessage(client, ClientMessageSchema)
    const { socket: first } = await connect('replacement', 'daemon')
    await firstOnline
    const firstClosed = nextClose(first)
    const stillOnline = nextMessage(client, ClientMessageSchema)
    const { socket: second } = await connect('replacement', 'daemon')
    expect((await firstClosed).code).toBe(1012)
    expect(await stillOnline).toMatchObject({ data: { status: 'online' } })
    const sentinel = nextMessage(client, ClientMessageSchema)
    sendJson(
      second,
      RoutedEventSchema.parse({
        audience: { type: 'host' },
        message: {
          v: 1,
          type: 'event',
          event: 'conversation.removed',
          data: { conversationId: CONVERSATION_ID },
        },
      }),
    )
    expect(await sentinel).toMatchObject({ event: 'conversation.removed' })
    second.close(1000, 'test complete')
    client.close(1000, 'test complete')
  })

  it('routes a request and its response', async () => {
    const { socket: daemon } = await connect('routing', 'daemon')
    const { socket: client } = await connect('routing', 'client')
    await nextMessage(client, ClientMessageSchema)
    const request = closeRequest()
    const routedPromise = nextMessage(daemon, RoutedRequestSchema)
    sendJson(client, request)
    const routed = await routedPromise
    expect(routed.message).toEqual(request)
    const result = RoutedResponseSchema.parse({
      route: routed.route,
      method: 'conversation.close',
      message: { v: 1, type: 'result', requestId: request.requestId, result: {} },
    })
    const response = nextMessage(client, ClientMessageSchema)
    sendJson(daemon, result)
    expect(await response).toMatchObject({ type: 'result', requestId: request.requestId })
    daemon.close(1000, 'test complete')
    client.close(1000, 'test complete')
  })

  it('returns typed client errors without closing the socket', async () => {
    const { socket } = await connect('client-errors', 'client')
    await nextMessage(socket, ClientMessageSchema)
    const offline = nextMessage(socket, ClientMessageSchema)
    sendJson(socket, closeRequest())
    expect(await offline).toMatchObject({ error: { _tag: 'HostOfflineError' } })
    const invalid = nextMessage(socket, ClientMessageSchema)
    sendJson(socket, { v: 1, type: 'request', requestId: createRequestId(), method: 'invalid' })
    expect(await invalid).toMatchObject({ error: { _tag: 'ValidationError' } })
    expect(socket.readyState).toBe(WebSocket.OPEN)
    socket.close(1000, 'test complete')
  })

  it.each([
    { name: 'binary client frame', role: 'client' as const, frame: new ArrayBuffer(1), code: 1003 },
    { name: 'invalid JSON', role: 'client' as const, frame: '{', code: 1007 },
    { name: 'invalid daemon frame', role: 'daemon' as const, frame: '{}', code: 1007 },
  ])('closes a socket for an $name', async ({ name, role, frame, code }) => {
    const { socket } = await connect(`invalid-${name}`, role)
    if (role === 'client') await nextMessage(socket, ClientMessageSchema)
    const closed = nextClose(socket)
    socket.send(frame)
    expect((await closed).code).toBe(code)
  })

  it('restores socket attachments and routing after eviction', async () => {
    const { socket: daemon, stub } = await connect('eviction-routing', 'daemon')
    const { socket: client } = await connect('eviction-routing', 'client')
    await nextMessage(client, ClientMessageSchema)
    await openConversation(client, daemon)
    await evictDurableObject(stub)
    const event = RoutedEventSchema.parse({
      audience: { type: 'conversation', conversationId: CONVERSATION_ID },
      message: {
        v: 1,
        type: 'event',
        event: 'conversation.removed',
        data: { conversationId: CONVERSATION_ID },
      },
    })
    const delivered = nextMessage(client, ClientMessageSchema)
    sendJson(daemon, event)
    expect(await delivered).toMatchObject({ event: 'conversation.removed' })
    const watcherClosed = nextMessage(daemon, RoutedRequestSchema)
    client.close(1000, 'test complete')
    expect((await watcherClosed).message.method).toBe('conversation.close')
    daemon.close(1000, 'test complete')
  })

  it('keeps synced rows and sends one sync request after eviction', async () => {
    const { socket: daemon, stub } = await connect('sync-deduplication', 'daemon')
    const { socket: client } = await connect('sync-deduplication', 'client')
    await nextMessage(client, ClientMessageSchema)
    const invalidated = nextMessage(client, ClientMessageSchema)
    sendJson(daemon, syncFrame())
    await invalidated
    expect((await stub.readConversations(PAGE_QUERY)).conversations).toEqual([SUMMARY])
    await evictDurableObject(stub)
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    const syncRequest = nextMessage(daemon, RoutedRequestSchema)
    const first = await stub.readConversations(PAGE_QUERY)
    expect((await syncRequest).message.method).toBe('conversations.sync')
    now.mockReturnValue(31_000)
    const second = await stub.readConversations(PAGE_QUERY)
    expect(first.conversations).toEqual([SUMMARY])
    expect(second.conversations).toEqual([SUMMARY])
    const sentinel = nextMessage(daemon, RoutedRequestSchema)
    sendJson(client, closeRequest())
    expect((await sentinel).message.method).toBe('conversation.close')
    daemon.close(1000, 'test complete')
    client.close(1000, 'test complete')
  })

  it('requests a new sync at the stale boundary', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    const { socket: daemon, stub } = await connect('sync-stale-boundary', 'daemon')
    const { socket: client } = await connect('sync-stale-boundary', 'client')
    await nextMessage(client, ClientMessageSchema)
    const invalidated = nextMessage(client, ClientMessageSchema)
    sendJson(daemon, syncFrame())
    await invalidated
    now.mockReturnValue(29_999)
    await stub.readConversations(PAGE_QUERY)
    const sentinel = nextMessage(daemon, RoutedRequestSchema)
    sendJson(client, closeRequest())
    expect((await sentinel).message.method).toBe('conversation.close')
    now.mockReturnValue(30_000)
    const syncRequest = nextMessage(daemon, RoutedRequestSchema)
    await stub.readConversations(PAGE_QUERY)
    expect((await syncRequest).message.method).toBe('conversations.sync')
    daemon.close(1000, 'test complete')
    client.close(1000, 'test complete')
  })

  it('rearms expiry while online and deletes rows while offline', async () => {
    const { socket: daemon, stub } = await connect('alarm', 'daemon')
    const { socket: client } = await connect('alarm', 'client')
    await nextMessage(client, ClientMessageSchema)
    const invalidated = nextMessage(client, ClientMessageSchema)
    sendJson(daemon, syncFrame())
    await invalidated
    expect((await stub.readConversations(PAGE_QUERY)).conversations).toHaveLength(1)
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    expect((await stub.readConversations(PAGE_QUERY)).conversations).toHaveLength(1)
    daemon.close(1000, 'test complete')
    expect((await stub.readStatus()).status).toBe('offline')
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    expect((await stub.readConversations(PAGE_QUERY)).conversations).toHaveLength(0)
    expect(await runDurableObjectAlarm(stub)).toBe(false)
    client.close(1000, 'test complete')
  })

  it('disconnects every socket and clears storage', async () => {
    const { socket: daemon, stub } = await connect('disconnect-all', 'daemon')
    const { socket: client } = await connect('disconnect-all', 'client')
    await nextMessage(client, ClientMessageSchema)
    const invalidated = nextMessage(client, ClientMessageSchema)
    sendJson(daemon, syncFrame())
    await invalidated
    const daemonClosed = nextClose(daemon)
    const clientClosed = nextClose(client)
    await stub.disconnectAll()
    expect((await daemonClosed).code).toBe(1000)
    expect((await clientClosed).code).toBe(1000)
    const tables = await runInDurableObject(stub, (_relay, state) =>
      Array.from(
        state.storage.sql.exec(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'conversation'",
        ),
      ),
    )
    expect(tables).toEqual([])
    expect(await runDurableObjectAlarm(stub)).toBe(false)
  })

  it('records host presence without changing pairing state', async () => {
    const database = env.DB
    if (database === undefined) throw new Error('DB is not bound')
    const db = createDatabase(database)
    const repository = new DrizzleHostRepository(() => db)
    const userId = UserIdSchema.parse('00000000-0000-7000-8000-000000000001')
    await db.insert(user).values({
      id: userId,
      name: 'Test User',
      email: 'relay-race@example.com',
      emailVerified: true,
    })
    const oldHost = Host.register({
      id: createHostId(),
      userId,
      name: 'Old Mac',
      platform: 'darwin',
      at: new Date('2026-08-22T10:00:00.000Z'),
    })
    oldHost.revoke(new Date('2026-08-22T10:01:00.000Z'))
    await repository.save(oldHost)
    await repository.recordSeen(oldHost.id, new Date('2026-08-22T10:02:00.000Z'))
    await repository.recordSeen(oldHost.id, new Date('2026-08-22T10:01:30.000Z'))
    const recorded = await repository.findById(oldHost.id)
    expect(recorded?.isRevoked).toBe(true)
    expect(recorded?.toPlainObject().lastSeenAt).toEqual(new Date('2026-08-22T10:02:00.000Z'))
    const replacement = Host.register({
      id: createHostId(),
      userId,
      name: 'New Mac',
      platform: 'darwin',
      at: new Date('2026-08-22T10:03:00.000Z'),
    })
    await repository.save(replacement)
    await repository.recordSeen(oldHost.id, new Date('2026-08-22T10:04:00.000Z'))
    expect(await repository.findById(oldHost.id)).toBeNull()
    expect((await repository.findById(replacement.id))?.toPlainObject().lastSeenAt).toBeNull()
  })
})
