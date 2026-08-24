import type { HostApplicationResources } from '@host/application/host-application-resources.ts'
import { ConversationCatalog } from '@host/domain/conversation/conversation-catalog.ts'
import { retryDelayMs } from '@host/entrypoints/websocket/control-connection.ts'
import { CONTROL_METHOD_HANDLERS } from '@host/entrypoints/websocket/control-method-handlers.ts'
import { CONVERSATION_METHOD_HANDLERS } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { HostConnectionManager } from '@host/entrypoints/websocket/host-connection-manager'
import type {
  PartySocketClientInput,
  WebSocketClient,
} from '@host/infrastructure/websocket/party-socket-client.ts'
import {
  ConversationIdSchema,
  ConversationSchema,
  HOST_CONTROL_SUBPROTOCOL,
  JsonRpcDocumentSchema,
  createRequestId,
  jsonRpcRequest,
  type JsonRpcDocument,
} from '@porte/core/client'
import { Result } from 'better-result'
import { describe, expect, it, vi } from 'vitest'

class MockPartySocket extends EventTarget implements WebSocketClient {
  readonly retryCount = 0
  readonly sent: string[] = []
  readonly connectionFailure = undefined
  private openState = false

  send(data: string): boolean {
    if (this.openState) this.sent.push(data)
    return this.openState
  }

  close(): void {
    this.openState = false
  }

  reconnect(): void {}

  open(): void {
    this.openState = true
    this.dispatchEvent(new Event('open'))
  }

  receive(data: string): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}

describe('retryDelayMs', () => {
  it('uses a bounded exponential delay', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(retryDelayMs)).toEqual([
      0, 250, 500, 1_000, 2_000, 4_000, 5_000,
    ])
  })
})

describe('Host WebSocket connections', () => {
  it('does not process messages after closure', () => {
    const test = connectionTest()
    test.manager.closeControlConnection()
    test.control.receive(
      JSON.stringify(
        jsonRpcRequest(createRequestId(), 'conversation.attach', {
          conversationId: ConversationIdSchema.parse('conversation-1'),
        }),
      ),
    )
    expect(test.conversations).toHaveLength(0)
  })

  it('answers one validated control query', async () => {
    const test = connectionTest()
    test.control.open()
    test.control.receive(
      JSON.stringify(jsonRpcRequest(createRequestId(), 'conversations.list', { limit: 50 })),
    )
    await vi.waitFor(() => {
      expect(jsonFrames(test.control).at(-1)?.result).toEqual({ conversations: [] })
    })
    test.manager.closeControlConnection()
  })

  it('opens one conversation connection after attach', async () => {
    const test = connectionTest()
    const conversationId = ConversationIdSchema.parse('conversation-1')
    test.control.open()
    test.control.receive(
      JSON.stringify(jsonRpcRequest(createRequestId(), 'conversation.attach', { conversationId })),
    )
    await vi.waitFor(() => {
      expect(test.conversations).toHaveLength(1)
    })
    test.conversations[0]?.open()
    await vi.waitFor(() => {
      expect(jsonFrames(test.control).at(-1)?.result).toBe(null)
    })
    expect(jsonFrames(test.conversations[0]).at(-1)?.method).toBe('conversation.state')
    test.manager.closeControlConnection()
  })
})

function connectionTest() {
  const control = new MockPartySocket()
  const conversations: MockPartySocket[] = []
  const createClient = (input: PartySocketClientInput): WebSocketClient => {
    if (input.subprotocol === HOST_CONTROL_SUBPROTOCOL) return control
    const socket = new MockPartySocket()
    conversations.push(socket)
    return socket
  }
  const manager = new HostConnectionManager(
    {
      baseUrl: 'https://relay.example.com',
      controlHandlers: CONTROL_METHOD_HANDLERS,
      conversationHandlers: CONVERSATION_METHOD_HANDLERS,
      resources: resources(),
      token: 'secret',
    },
    createClient,
  )
  manager.openControlConnection()
  return { control, conversations, manager }
}

function resources(): HostApplicationResources {
  const empty = async () => Result.ok()
  return {
    agent: {
      listConversations: async () => Result.ok([]),
      openConversation: async () =>
        Result.ok({
          turn: { state: 'idle' },
          items: [],
          tools: [],
          plans: [],
          pending: { permissions: [], elicitations: [] },
        }),
      createConversation: async () =>
        Result.ok(
          ConversationSchema.parse({
            id: 'unused',
            cwd: '/tmp',
            gitRoot: '/tmp',
            title: 'Unused',
            updatedAt: '2026-01-01T00:00:00Z',
          }),
        ),
      closeConversation: empty,
      startTurn: empty,
      cancelTurn: empty,
      setConfiguration: empty,
      answerPermission: empty,
      answerElicitation: empty,
    },
    catalog: new ConversationCatalog(),
    creations: {
      claim: async () => Result.ok({ status: 'claimed' }),
      complete: empty,
    },
  }
}

function jsonFrames(socket: MockPartySocket | undefined): JsonRpcDocument[] {
  return (socket?.sent ?? []).flatMap((frame) => {
    const parsed = JsonRpcDocumentSchema.safeParse(JSON.parse(frame))
    return parsed.success ? [parsed.data] : []
  })
}
