import {
  ClientMessageSchema,
  ConversationIdSchema,
  RequestMessageSchema,
  RoutedRequestSchema,
  createHostId,
  createRequestId,
  setLogSink,
  setLoggerErrorHook,
} from '@porte/core'
import {
  RELAY_HOST_ID_HEADER,
  RELAY_ROLE_HEADER,
} from '@server/infrastructure/durable-objects/relay/relay-headers.ts'
import { env } from 'cloudflare:workers'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { applyDatabaseTestMigrations } from './database-test-migrations.ts'

const HOST_ID = createHostId()
const CONVERSATION_ID = ConversationIdSchema.parse('conversation-1')

async function connect(name: string, role: 'client' | 'daemon'): Promise<WebSocket> {
  const relays = env.HOST_RELAY_DO
  if (relays === undefined) throw new Error('HOST_RELAY_DO is not bound')
  const response = await relays.getByName(name).fetch('https://relay.test', {
    headers: { Upgrade: 'websocket', [RELAY_ROLE_HEADER]: role, [RELAY_HOST_ID_HEADER]: HOST_ID },
  })
  const socket = response.webSocket
  if (socket === null) throw new Error('Expected a WebSocket response')
  socket.accept()
  return socket
}

function nextMessage<T>(socket: WebSocket, schema: z.ZodType<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.addEventListener(
      'message',
      (event) => {
        try {
          resolve(schema.parse(JSON.parse(z.string().parse(event.data))))
        } catch (error) {
          reject(error)
        }
      },
      { once: true },
    )
  })
}

beforeAll(applyDatabaseTestMigrations)
afterAll(() => setLoggerErrorHook(() => undefined))

it('keeps routing when host persistence fails', async () => {
  const database = env.DB
  if (database === undefined) throw new Error('DB is not bound')
  setLogSink(() => undefined)
  let hostSeenFailed = false
  setLoggerErrorHook(({ context }) => {
    if (context.hostId === HOST_ID) hostSeenFailed = true
  })
  await database.exec('DROP TABLE host')
  const client = await connect('host-seen-failure', 'client')
  await nextMessage(client, ClientMessageSchema)
  const online = nextMessage(client, ClientMessageSchema)
  const daemon = await connect('host-seen-failure', 'daemon')
  expect(await online).toMatchObject({ data: { status: 'online' } })
  await vi.waitFor(() => expect(hostSeenFailed).toBe(true))
  const routed = nextMessage(daemon, RoutedRequestSchema)
  client.send(JSON.stringify(closeRequest()))
  expect((await routed).message.method).toBe('conversation.close')
  expect(client.readyState).toBe(WebSocket.OPEN)
  daemon.close(1000, 'test complete')
  client.close(1000, 'test complete')
})

function closeRequest() {
  return RequestMessageSchema.parse({
    v: 1,
    type: 'request',
    requestId: createRequestId(),
    method: 'conversation.close',
    params: { conversationId: CONVERSATION_ID },
  })
}
