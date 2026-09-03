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
  MessageIdSchema,
  createAttemptId,
  createRequestId,
  jsonRpcRequest,
  turnIdFor,
  type JsonRpcDocument,
  type JsonRpcParams,
} from '@porte/core/client'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

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
    // The attach answers only once the socket is up, so it stays in flight until `connect`.
    const attached = test.control.receive(request('conversation.attach', attach))
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(1)
    })
    await test.conversations[0]?.connect()
    await attached
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
    const attached = test.control.receive(request('conversation.attach', attach))
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(1)
    })
    const load = vi.spyOn(test.deps.codingAgent, 'loadSession')
    await test.conversations[0]?.connect()
    await attached
    await test.conversations[0]?.connect()
    expect(load).toHaveBeenCalledTimes(1)
    test.manager.closeAll()
  })

  it('sends conversation events on the conversation socket once it is up', async () => {
    const test = connectionTest()
    await test.control.connect()
    const attached = test.control.receive(request('conversation.attach', attach))
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(1)
    })
    await test.conversations[0]?.connect()
    await attached
    const started = test.conversations[0]?.receive(
      request('turn.start', {
        attemptId: '0199f97b-9cf1-7f05-9e9d-df1647d7a821',
        userMessage: { id: 'browser-1', content: [{ type: 'text', text: 'hi' }] },
      }),
    )
    // `turn.start` answers once Grok echoes the prompt; the fake agent echoes it here.
    await vi.waitFor(() => {
      expect(test.deps.codingAgent.prompted).toHaveLength(1)
    })
    const turnId = turnIdFor(conversationId, 0)
    const messageId = MessageIdSchema.parse(`${turnId}:user`)
    test.deps.codingAgent.push(conversationId, [
      { type: 'turn.started', turnId, attemptId: createAttemptId() },
      { type: 'message.started', turnId, messageId, role: 'user' },
      { type: 'message.delta', turnId, messageId, content: { type: 'text', text: 'hi' } },
      { type: 'message.completed', turnId, messageId },
    ])
    await started
    const methods = jsonFrames(test.conversations[0]).map((frame) =>
      'method' in frame ? frame.method : 'response',
    )
    // The request answers on `turn.started`, so the response lands among the echo's events.
    expect(methods[0]).toBe('conversation.event')
    expect(methods.filter((method) => method === 'conversation.event')).toHaveLength(4)
    expect(methods.filter((method) => method === 'response')).toHaveLength(1)
    test.manager.closeAll()
  })

  it('a reconnect starts the event seq at 1 again', async () => {
    const test = connectionTest()
    await test.control.connect()
    const attached = test.control.receive(request('conversation.attach', attach))
    await vi.waitFor(() => {
      expect(test.conversations[0]).toBeDefined()
    })
    await test.conversations[0]?.connect()
    await attached
    const started = test.conversations[0]?.receive(
      request('turn.start', {
        attemptId: '0199f97b-9cf1-7f05-9e9d-df1647d7a821',
        userMessage: { id: 'browser-1', content: [{ type: 'text', text: 'hi' }] },
      }),
    )
    await vi.waitFor(() => {
      expect(test.deps.codingAgent.prompted).toHaveLength(1)
    })
    const turnId = turnIdFor(conversationId, 0)
    const messageId = MessageIdSchema.parse(`${turnId}:user`)
    test.deps.codingAgent.push(conversationId, [
      { type: 'turn.started', turnId, attemptId: createAttemptId() },
      { type: 'message.started', turnId, messageId, role: 'user' },
      { type: 'message.delta', turnId, messageId, content: { type: 'text', text: 'hi' } },
      { type: 'message.completed', turnId, messageId },
    ])
    await started
    // The relay keys its expectation by socket, so a new socket must see 1 first.
    await test.conversations[0]?.connect()
    const replyId = MessageIdSchema.parse(`${turnId}:assistant`)
    test.deps.codingAgent.push(conversationId, [
      { type: 'message.started', turnId, messageId: replyId, role: 'assistant' },
      { type: 'message.delta', turnId, messageId: replyId, content: { type: 'text', text: 'yo' } },
      { type: 'message.completed', turnId, messageId: replyId },
    ])
    await vi.waitFor(() => {
      expect(eventSeqs(test.conversations[0])).toEqual([1, 2, 3, 4, 1, 2, 3])
    })
    test.manager.closeAll()
  })

  it('conversation.model.set carries the model and effort pair to the agent', async () => {
    const test = connectionTest()
    await test.control.connect()
    const attached = test.control.receive(request('conversation.attach', attach))
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(1)
    })
    await test.conversations[0]?.connect()
    await attached
    await test.conversations[0]?.receive(
      request('conversation.model.set', { modelId: 'grok-4.5', reasoningEffort: 'low' }),
    )
    expect(test.deps.codingAgent.setModel).toHaveBeenCalledWith(conversationId, 'grok-4.5', 'low')
    test.manager.closeAll()
  })

  it('removes a stopped conversation connection so attach opens a new one', async () => {
    const test = connectionTest()
    await test.control.connect()
    const attached = test.control.receive(request('conversation.attach', attach))
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(1)
    })
    await test.conversations[0]?.connect()
    await attached
    test.conversations[0]?.stop()
    await Promise.resolve()
    // The second socket never comes up; closing it below answers this attach with an error.
    const reattached = test.control.receive(request('conversation.attach', attach))
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(2)
    })
    test.manager.closeAll()
    await reattached
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
      onLatestVersion: async () => undefined,
    },
    createTransport,
  )
  manager.connectControl()
  return { control, conversations, manager, deps }
}

function request(method: string, params: JsonRpcParams): string {
  return JSON.stringify(jsonRpcRequest(createRequestId(), method, params))
}

/** The `seq` of every `conversation.event` frame, in send order. */
function eventSeqs(transport: MockTransport | undefined): number[] {
  return jsonFrames(transport).flatMap((frame) => {
    if (!('method' in frame) || frame.method !== 'conversation.event') return []
    const params = SequencedEventSchema.safeParse(frame.params)
    return params.success ? [params.data.seq] : []
  })
}

const SequencedEventSchema = z.object({ seq: z.number() })

function jsonFrames(transport: MockTransport | undefined): JsonRpcDocument[] {
  return (transport?.sent ?? []).flatMap((frame) => {
    const parsed = JsonRpcDocumentSchema.safeParse(JSON.parse(frame))
    return parsed.success ? [parsed.data] : []
  })
}
