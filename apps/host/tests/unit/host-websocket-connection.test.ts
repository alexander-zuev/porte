import { CONTROL_METHOD_HANDLERS } from '@host/entrypoints/websocket/control-method-handlers.ts'
import { CONVERSATION_METHOD_HANDLERS } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { HostConnectionManager } from '@host/entrypoints/websocket/host-connection-manager.ts'
import type {
  PartySocketTransportInput,
  RelaySocket,
  RelaySocketListeners,
} from '@host/infrastructure/websocket/party-socket-transport.ts'
import {
  ConversationIdSchema,
  HOST_CONTROL_SUBPROTOCOL,
  JsonRpcDocumentSchema,
  createRequestId,
  jsonRpcRequest,
  type JsonRpcDocument,
  type JsonRpcParams,
} from '@porte/core/client'
import { describe, expect, it, vi } from 'vitest'

import { createTestDeps } from '../support/test-deps.ts'

const conversationId = ConversationIdSchema.parse('conversation-1')
const attach = { conversationId, cwd: process.cwd() }

class MockTransport implements RelaySocket {
  private readonly stoppedState = Promise.withResolvers<void>()
  private listeners: RelaySocketListeners | undefined
  private connected = false
  readonly sent: string[] = []

  readonly stopped = this.stoppedState.promise

  start(listeners: RelaySocketListeners): void {
    this.listeners = listeners
  }

  async send(frame: string): Promise<void> {
    if (this.connected) this.sent.push(frame)
  }

  stop(): void {
    this.connected = false
    this.listeners = undefined
    this.stoppedState.resolve()
  }

  async connect(): Promise<void> {
    this.connected = true
    await this.listeners?.onUp?.()
  }

  async receive(frame: string): Promise<void> {
    const document = await this.listeners?.onFrame(frame)
    if (document !== undefined) await this.send(JSON.stringify(document))
  }
}

describe('Host WebSocket connections', () => {
  it('does not process messages after closure', async () => {
    const test = connectionTest()
    test.manager.closeAll()
    await test.control.receive(request('conversation.attach', attach))
    expect(test.conversations).toHaveLength(0)
  })

  it('answers one validated control query through the bus', async () => {
    const test = connectionTest()
    await test.control.connect()
    await test.control.receive(request('conversations.list', {}))
    expect(jsonFrames(test.control).at(-1)?.result).toEqual({ conversations: [] })
    test.manager.closeAll()
  })

  it('attach opens a socket, its first open loads the session, get answers the snapshot', async () => {
    const test = connectionTest()
    await test.control.connect()
    await test.control.receive(request('conversation.attach', attach))
    expect(test.conversations).toHaveLength(1)
    await test.conversations[0]?.connect()
    expect(test.deps.codingAgent.sessions.get(conversationId)).toBe(attach.cwd)
    await test.conversations[0]?.receive(request('conversation.get', {}))
    expect(jsonFrames(test.conversations[0]).at(-1)?.result).toMatchObject({
      turn: { state: 'idle' },
      items: [],
    })
    test.manager.closeAll()
  })

  it('a reconnect does not load the session again', async () => {
    const test = connectionTest()
    await test.control.connect()
    await test.control.receive(request('conversation.attach', attach))
    const load = vi.spyOn(test.deps.codingAgent, 'loadSession')
    await test.conversations[0]?.connect()
    await test.conversations[0]?.connect()
    expect(load).toHaveBeenCalledTimes(1)
    test.manager.closeAll()
  })

  it('sends conversation events on the conversation socket once it is up', async () => {
    const test = connectionTest()
    await test.control.connect()
    await test.control.receive(request('conversation.attach', attach))
    await test.conversations[0]?.connect()
    await test.conversations[0]?.receive(
      request('turn.start', {
        turnId: 'turn-1',
        userMessage: { id: 'turn-1:user', content: [{ type: 'text', text: 'hi' }] },
      }),
    )
    const methods = jsonFrames(test.conversations[0]).map((frame) =>
      'method' in frame ? frame.method : 'response',
    )
    expect(methods).toEqual([
      'conversation.event',
      'conversation.event',
      'conversation.event',
      'conversation.event',
      'response',
    ])
    test.manager.closeAll()
  })

  it('removes a stopped conversation connection so attach opens a new one', async () => {
    const test = connectionTest()
    await test.control.connect()
    await test.control.receive(request('conversation.attach', attach))
    await test.conversations[0]?.connect()
    test.conversations[0]?.stop()
    await Promise.resolve()
    await test.control.receive(request('conversation.attach', attach))
    expect(test.conversations).toHaveLength(2)
    test.manager.closeAll()
  })
})

function connectionTest() {
  const control = new MockTransport()
  const conversations: MockTransport[] = []
  const deps = createTestDeps(() => manager)
  const createTransport = (input: PartySocketTransportInput): RelaySocket => {
    if (input.subprotocol === HOST_CONTROL_SUBPROTOCOL) return control
    const transport = new MockTransport()
    conversations.push(transport)
    return transport
  }
  const manager = new HostConnectionManager(
    {
      baseUrl: 'https://relay.example.com',
      token: 'secret',
      controlHandlers: CONTROL_METHOD_HANDLERS,
      conversationHandlers: CONVERSATION_METHOD_HANDLERS,
      bus: deps.bus,
    },
    createTransport,
  )
  manager.connectControl()
  return { control, conversations, manager, deps }
}

function request(method: string, params: JsonRpcParams): string {
  return JSON.stringify(jsonRpcRequest(createRequestId(), method, params))
}

function jsonFrames(transport: MockTransport | undefined): JsonRpcDocument[] {
  return (transport?.sent ?? []).flatMap((frame) => {
    const parsed = JsonRpcDocumentSchema.safeParse(JSON.parse(frame))
    return parsed.success ? [parsed.data] : []
  })
}
