import type { ConversationCatalog } from '@host/application/conversation-catalog.ts'
import type { AgentSessionFactory } from '@host/application/ports/agent-session-factory.ts'
import type { ConversationCreationStore } from '@host/application/ports/conversation-creation-store.ts'
import type { HostConnections } from '@host/application/ports/host-connections.ts'
import type { SessionOperations } from '@host/application/session-supervisor.ts'
import { ControlConnection } from '@host/entrypoints/websocket/control-connection.ts'
import type { ControlMethodHandlerRegistry } from '@host/entrypoints/websocket/control-method-handlers.ts'
import { ConversationConnection } from '@host/entrypoints/websocket/conversation-connection.ts'
import type { ConversationMethodHandlerRegistry } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import type { RelaySocketFactory } from '@host/infrastructure/websocket/party-socket-transport.ts'
import {
  HOST_CONTROL_SUBPROTOCOL,
  HOST_CONVERSATION_SUBPROTOCOL,
  type ConversationId,
} from '@porte/core/client'

/** Fixed dependencies for one Host connection manager. */
export type HostConnectionManagerInput = {
  readonly baseUrl: string
  readonly controlHandlers: ControlMethodHandlerRegistry
  readonly conversationHandlers: ConversationMethodHandlerRegistry
  readonly catalog: ConversationCatalog
  readonly creations: ConversationCreationStore
  readonly factory: AgentSessionFactory
  readonly sessions: SessionOperations
  readonly token: string
}

/** Owns the control connection and the active conversation connection registry. */
export class HostConnectionManager implements HostConnections {
  private readonly control: ControlConnection
  private readonly conversations = new Map<ConversationId, ConversationConnection>()

  constructor(
    private readonly input: HostConnectionManagerInput,
    private readonly createTransport: RelaySocketFactory,
  ) {
    const transport = createTransport({
      url: this.controlUrl(),
      subprotocol: HOST_CONTROL_SUBPROTOCOL,
      authorization: `Bearer ${input.token}`,
    })
    this.control = new ControlConnection(transport, input.controlHandlers, {
      connections: this,
      catalog: input.catalog,
      creations: input.creations,
      factory: input.factory,
      sessions: input.sessions,
    })
  }

  get controlStopped(): Promise<void> {
    return this.control.stopped
  }

  connectControl(): void {
    this.control.start()
  }

  connectConversation(conversationId: ConversationId): void {
    if (this.conversations.has(conversationId)) return

    const transport = this.createTransport({
      url: this.conversationUrl(conversationId),
      subprotocol: HOST_CONVERSATION_SUBPROTOCOL,
      authorization: `Bearer ${this.input.token}`,
    })
    const connection = new ConversationConnection(
      conversationId,
      transport,
      this.input.conversationHandlers,
      this.input.sessions,
      this.input.catalog,
      this.control.notifications,
      (stopped) => {
        this.removeConversation(stopped)
      },
    )
    this.conversations.set(conversationId, connection)
    connection.start()
  }

  closeConversation(conversationId: ConversationId): Promise<void> {
    const connection = this.conversations.get(conversationId)
    if (connection !== undefined) {
      connection.stop()
      this.removeConversation(connection)
    }
    return Promise.resolve()
  }

  closeAll(): Promise<void> {
    for (const connection of this.conversations.values()) connection.stop()
    this.conversations.clear()
    this.control.stop()
    return Promise.resolve()
  }

  private removeConversation(connection: ConversationConnection): void {
    if (this.conversations.get(connection.conversationId) === connection) {
      this.conversations.delete(connection.conversationId)
    }
  }

  private controlUrl(): string {
    const url = new URL('/api/host/ws', this.input.baseUrl)
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
    return url.href
  }

  private conversationUrl(conversationId: ConversationId): string {
    const url = new URL(this.controlUrl())
    url.pathname = `${url.pathname.replace(/\/$/, '')}/sub/conversation-agent/${encodeURIComponent(conversationId)}`
    return url.href
  }
}
