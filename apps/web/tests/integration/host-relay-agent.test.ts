import {
  HOST_CONTROL_SUBPROTOCOL,
  HOST_CONVERSATION_SUBPROTOCOL,
  ConversationIdSchema,
  IsoDateTimeSchema,
  createHostId,
  createTurnId,
  hostControlRequestSchema,
  jsonRpcNotification,
  type Conversation,
  type HostControlRequestMethod,
  type HostId,
} from '@porte/core'
import type { HostRelayAgent } from '@server/infrastructure/durable-objects/host-relay-agent.ts'
import { RELAY_HOST_ID_HEADER } from '@server/infrastructure/durable-objects/relay/relay-headers.ts'
import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { applyDatabaseTestMigrations } from './database-test-migrations.ts'

const conversation: Conversation = {
  id: ConversationIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca69580001fd'),
  cwd: '/workspace/porte',
  gitRoot: '/workspace/porte',
  title: 'Relay transport',
  updatedAt: IsoDateTimeSchema.parse('2026-08-23T00:00:00.000Z'),
}

beforeAll(applyDatabaseTestMigrations)

describe('HostRelayAgent control connection', () => {
  it('syncs the control cache with JSON-RPC', async () => {
    const host = await connect(createHostId())
    const request = await host.nextRequest('conversations.list')
    host.result(request.id, { conversations: [conversation] })

    await vi.waitFor(async () => {
      const page = await host.stub.readConversations({ limit: 50 })
      expect(page.conversations).toEqual([conversation])
    })
  })

  it('publishes liveness from the control connection', async () => {
    const host = await connect(createHostId())
    host.result((await host.nextRequest('conversations.list')).id, { conversations: [] })
    expect(await host.stub.readStatus()).toEqual({ status: 'online' })

    host.socket.close(1000, 'test complete')
    await vi.waitFor(async () =>
      expect(await host.stub.readStatus()).toEqual({ status: 'offline' }),
    )
  })

  it('rejects a Host identity that differs from the Agent name', async () => {
    const host = await connect(createHostId(), createHostId())
    expect((await host.inbox.closed()).code).toBe(1008)
  })

  it('rejects a non-JSON-RPC control frame', async () => {
    const host = await connect(createHostId())
    host.socket.send('{"type":"command"}')
    expect((await host.inbox.closed()).code).toBe(1007)
  })

  it('routes conversation state through the child data connection', async () => {
    const hostId = createHostId()
    const host = await connect(hostId)
    host.result((await host.nextRequest('conversations.list')).id, {
      conversations: [conversation],
    })
    await vi.waitFor(async () => {
      expect((await host.stub.readConversations({ limit: 50 })).conversations).toHaveLength(1)
    })
    const data = await connectConversation(host.stub, hostId, conversation.id)
    const turnId = createTurnId()

    data.socket.send(
      JSON.stringify(
        jsonRpcNotification('conversation.state', {
          state: {
            turn: { state: 'running', turnId },
            items: [],
            tools: [],
            plans: [],
            pending: { permissions: [], elicitations: [] },
          },
        }),
      ),
    )
    await vi.waitFor(async () => {
      const active = await runInDurableObject(
        host.stub,
        (relay: HostRelayAgent) => relay.state.activeConversations,
      )
      expect(active).toEqual([
        { conversationId: conversation.id, turnId, hasAssistantMessage: false },
      ])
    })
    expect(data.inbox.snapshot()).toEqual([])
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
      'Sec-WebSocket-Protocol': HOST_CONTROL_SUBPROTOCOL,
      [RELAY_HOST_ID_HEADER]: headerHostId,
    },
  })
  if (response.webSocket === null) throw new Error('Expected a WebSocket response')
  const inbox = new SocketInbox(response.webSocket)
  response.webSocket.accept()
  return new HostSocket(stub, response.webSocket, inbox)
}

async function connectConversation(
  stub: DurableObjectStub<HostRelayAgent>,
  hostId: HostId,
  conversationId: Conversation['id'],
) {
  const response = await stub.fetch(`https://relay.test/sub/conversation-agent/${conversationId}`, {
    headers: {
      Upgrade: 'websocket',
      'Sec-WebSocket-Protocol': HOST_CONVERSATION_SUBPROTOCOL,
      [RELAY_HOST_ID_HEADER]: hostId,
    },
  })
  if (response.webSocket === null) throw new Error('Expected a conversation WebSocket response')
  const inbox = new SocketInbox(response.webSocket)
  response.webSocket.accept()
  return { socket: response.webSocket, inbox }
}

class HostSocket {
  constructor(
    readonly stub: DurableObjectStub<HostRelayAgent>,
    readonly socket: WebSocket,
    readonly inbox: SocketInbox,
  ) {}

  async nextRequest<Method extends HostControlRequestMethod>(method: Method) {
    const schema = hostControlRequestSchema(method)
    for (;;) {
      const parsed = schema.safeParse(JSON.parse(await this.inbox.next()))
      if (parsed.success) return parsed.data
    }
  }

  result(id: string, result: unknown): void {
    this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, result }))
  }
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

  snapshot(): readonly string[] {
    return this.frames
  }

  private push(frame: string): void {
    const reader = this.readers.shift()
    if (reader === undefined) this.frames.push(frame)
    else reader(frame)
  }
}
