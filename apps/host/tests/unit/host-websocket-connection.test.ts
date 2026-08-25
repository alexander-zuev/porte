import { ConversationCatalog } from '@host/application/conversation-catalog.ts'
import type { AgentSessionFactory } from '@host/application/ports/agent-session-factory.ts'
import type { SessionOperations } from '@host/application/session-supervisor.ts'
import { CONTROL_METHOD_HANDLERS } from '@host/entrypoints/websocket/control-method-handlers.ts'
import { CONVERSATION_METHOD_HANDLERS } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { HostConnectionManager } from '@host/entrypoints/websocket/host-connection-manager'
import type {
  PartySocketTransportInput,
  RelaySocket,
  RelaySocketListeners,
} from '@host/infrastructure/websocket/party-socket-transport.ts'
import {
  ConversationIdSchema,
  ConversationSchema,
  HOST_CONTROL_SUBPROTOCOL,
  JsonRpcDocumentSchema,
  createRequestId,
  jsonRpcRequest,
  type JsonRpcDocument,
  type JsonRpcParams,
} from '@porte/core/client'
import { describe, expect, it, vi } from 'vitest'

const emptyOperation = async () => undefined

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
    await test.manager.closeAll()
    await test.control.receive(
      request('conversation.attach', {
        conversationId: ConversationIdSchema.parse('conversation-1'),
      }),
    )
    expect(test.conversations).toHaveLength(0)
  })

  it('answers one validated control query', async () => {
    const test = connectionTest()
    await test.control.connect()
    await test.control.receive(request('conversations.list', { limit: 50 }))
    expect(jsonFrames(test.control).at(-1)?.result).toEqual({ conversations: [] })
    await test.manager.closeAll()
  })

  it('opens one conversation transport after attach', async () => {
    const test = connectionTest()
    const conversationId = ConversationIdSchema.parse('conversation-1')
    await test.control.connect()
    void test.control.receive(request('conversation.attach', { conversationId }))
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(1)
    })
    await test.conversations[0]?.connect()
    await vi.waitFor(() => {
      expect(jsonFrames(test.control).at(-1)?.result).toBe(null)
    })
    expect(jsonFrames(test.conversations[0]).at(-1)?.method).toBe('conversation.state')
    await test.manager.closeAll()
  })

  it('reattaches the same session after reconnect', async () => {
    const test = connectionTest()
    const conversationId = ConversationIdSchema.parse('conversation-1')
    await test.control.connect()
    void test.control.receive(request('conversation.attach', { conversationId }))
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(1)
    })
    await test.conversations[0]?.connect()
    await test.conversations[0]?.connect()
    expect(test.sessions.openConversation).toHaveBeenCalledTimes(2)
    await test.manager.closeAll()
  })

  it('removes a stopped conversation connection', async () => {
    const test = connectionTest()
    const conversationId = ConversationIdSchema.parse('conversation-1')
    await test.control.connect()
    const attached = test.control.receive(request('conversation.attach', { conversationId }))
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(1)
    })
    await test.conversations[0]?.connect()
    await attached
    test.conversations[0]?.stop()
    await Promise.resolve()
    const reattached = test.control.receive(request('conversation.attach', { conversationId }))
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(2)
    })
    await test.conversations[1]?.connect()
    await reattached
    await test.manager.closeAll()
  })
})

function connectionTest() {
  const control = new MockTransport()
  const conversations: MockTransport[] = []
  const sessionOperations = sessions()
  const createTransport = (input: PartySocketTransportInput): RelaySocket => {
    if (input.subprotocol === HOST_CONTROL_SUBPROTOCOL) return control
    const transport = new MockTransport()
    conversations.push(transport)
    return transport
  }
  const manager = new HostConnectionManager(
    {
      baseUrl: 'https://relay.example.com',
      controlHandlers: CONTROL_METHOD_HANDLERS,
      conversationHandlers: CONVERSATION_METHOD_HANDLERS,
      catalog: new ConversationCatalog(),
      creations: {
        claim: async () => ({ status: 'claimed' as const }),
        complete: async () => undefined,
      },
      factory: agentFactory(),
      sessions: sessionOperations,
      token: 'secret',
    },
    createTransport,
  )
  manager.connectControl()
  return { control, conversations, manager, sessions: sessionOperations }
}

function sessions(): SessionOperations {
  return {
    openConversation: vi.fn(async () => ({
      turn: { state: 'idle' as const },
      items: [],
      tools: [],
      plans: [],
      pending: { permissions: [], elicitations: [] },
    })),
    createConversation: async () =>
      ConversationSchema.parse({
        id: 'unused',
        cwd: '/tmp',
        gitRoot: '/tmp',
        title: 'Unused',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    closeConversation: emptyOperation,
    startTurn: emptyOperation,
    cancelTurn: emptyOperation,
    setConfiguration: emptyOperation,
    answerPermission: emptyOperation,
    answerElicitation: emptyOperation,
    closeAll: emptyOperation,
  }
}

function agentFactory(): AgentSessionFactory {
  return {
    list: async () => [],
    open: () => Promise.reject(new TypeError('unexpected open')),
    create: () => Promise.reject(new TypeError('unexpected create')),
  }
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
