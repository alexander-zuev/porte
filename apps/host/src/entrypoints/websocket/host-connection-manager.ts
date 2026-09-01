import type { IMessageBus } from '@host/application/message-bus.ts'
import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import type { HostConnections } from '@host/application/ports/host-connections.ts'
import type { RelayStatusListener } from '@host/application/ports/relay-status.ts'
import { ControlConnection } from '@host/entrypoints/websocket/control-connection.ts'
import type { ControlMethodHandlerRegistry } from '@host/entrypoints/websocket/control-method-handlers.ts'
import { ConversationConnection } from '@host/entrypoints/websocket/conversation-connection.ts'
import type { ConversationMethodHandlerRegistry } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import type { RelaySocketFactory } from '@host/infrastructure/websocket/party-socket-transport.ts'
import {
  HOST_CONTROL_SUBPROTOCOL,
  HOST_CONVERSATION_SUBPROTOCOL,
  createLogger,
  type ConversationId,
} from '@porte/core/client'

const logger = createLogger('host-connection-manager')

/** Fixed dependencies for one Host connection manager. */
export type HostConnectionManagerInput = {
  readonly baseUrl: string
  readonly token: string
  readonly controlHandlers: ControlMethodHandlerRegistry
  readonly conversationHandlers: ConversationMethodHandlerRegistry
  readonly bus: IMessageBus
}

/** Owns the control connection and the active conversation connection registry. */
export class HostConnectionManager implements HostConnections {
  private readonly controlConnection: ControlConnection
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
    this.controlConnection = new ControlConnection(transport, input.controlHandlers, {
      bus: input.bus,
      connections: this,
    })
  }

  get controlStopped(): Promise<void> {
    return this.controlConnection.stopped
  }

  get control(): ControlNotifications {
    return this.controlConnection.notifications
  }

  connectControl(onStatus?: RelayStatusListener): void {
    this.controlConnection.start(onStatus)
  }

  connectConversation(conversationId: ConversationId, cwd: string): Promise<void> {
    const existing = this.conversations.get(conversationId)
    if (existing !== undefined) return existing.ready

    const transport = this.createTransport({
      url: this.conversationUrl(conversationId),
      subprotocol: HOST_CONVERSATION_SUBPROTOCOL,
      authorization: `Bearer ${this.input.token}`,
    })
    const connection = new ConversationConnection(
      conversationId,
      cwd,
      transport,
      this.input.conversationHandlers,
      this.input.bus,
    )
    this.conversations.set(conversationId, connection)
    void connection.stopped.then(
      () => {
        this.removeConversation(connection)
        return undefined
      },
      (cause: unknown) => {
        logger.error('host_conversation_connection_failed', {
          error: cause,
          details: { conversationId },
        })
        this.removeConversation(connection)
        return undefined
      },
    )
    connection.start()
    return connection.ready
  }

  conversation(conversationId: ConversationId): ConversationNotifications | null {
    return this.conversations.get(conversationId)?.notifications ?? null
  }

  closeConversation(conversationId: ConversationId): void {
    const connection = this.conversations.get(conversationId)
    if (connection === undefined) return
    connection.stop()
    this.removeConversation(connection)
  }

  closeAll(): void {
    for (const connection of this.conversations.values()) connection.stop()
    this.conversations.clear()
    this.controlConnection.stop()
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
