import type { HostApplicationResources } from '@host/application/host-application-resources.ts'
import {
  type ControlConnection,
  WebSocketControlConnection,
} from '@host/entrypoints/websocket/control-connection.ts'
import { JsonRpcControlDispatcher } from '@host/entrypoints/websocket/control-dispatcher.ts'
import {
  type ControlMethodHandlerRegistry,
  type ControlMethodContext,
} from '@host/entrypoints/websocket/control-method-handlers.ts'
import {
  type ConversationConnection,
  WebSocketConversationConnection,
} from '@host/entrypoints/websocket/conversation-connection.ts'
import { JsonRpcConversationDispatcher } from '@host/entrypoints/websocket/conversation-dispatcher.ts'
import type { ConversationMethodHandlerRegistry } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { HostConnectionStateError } from '@host/entrypoints/websocket/websocket-errors.ts'
import type { WebSocketClientFactory } from '@host/infrastructure/websocket/party-socket-client.ts'
import {
  WebSocketControlNotifications,
  WebSocketConversationNotifications,
} from '@host/infrastructure/websocket/websocket-notifications.ts'
import {
  createLogger,
  HOST_CONTROL_SUBPROTOCOL,
  HOST_CONVERSATION_SUBPROTOCOL,
  type ConversationId,
} from '@porte/core/client'

const logger = createLogger('host-connections')

/** Fixed dependencies for one Host connection manager. */
export type HostConnectionManagerInput = {
  readonly baseUrl: string
  readonly controlHandlers: ControlMethodHandlerRegistry
  readonly conversationHandlers: ConversationMethodHandlerRegistry
  readonly resources: HostApplicationResources
  readonly token: string
}

/** Connections owned by one running Host process. */
export interface IHostconectionManager {
  /** Open or return the control connection. */
  openControlConnection(): ControlConnection

  /** Close the control connection and all conversation connections. */
  closeControlConnection(): void

  /** Open or return one conversation connection. */
  openConversationConnection(conversationId: ConversationId): ConversationConnection

  /** Close and remove one conversation connection. */
  closeConversationConnection(conversationId: ConversationId): void
}

type OpenControlConnection = {
  readonly connection: ControlConnection
  readonly notifications: WebSocketControlNotifications
}

/** Own one control connection and at most one connection for each conversation. */
export class HostConnectionManager implements IHostconectionManager {
  private readonly conversations = new Map<ConversationId, ConversationConnection>()
  private control: OpenControlConnection | undefined

  constructor(
    private readonly input: HostConnectionManagerInput,
    private readonly createClient: WebSocketClientFactory,
  ) {}

  /** Open or return the control connection. */
  openControlConnection(): ControlConnection {
    if (this.control !== undefined) return this.control.connection

    const socket = this.createClient({
      url: this.controlConnectionUrl(),
      subprotocol: HOST_CONTROL_SUBPROTOCOL,
      authorization: `Bearer ${this.input.token}`,
    })
    const notifications = new WebSocketControlNotifications(socket)
    const context: ControlMethodContext = {
      connections: this,
      resources: this.input.resources,
    }
    const connection = new WebSocketControlConnection({
      socket,
      dispatcher: new JsonRpcControlDispatcher(this.input.controlHandlers, context),
    })

    this.control = { connection, notifications }
    connection.open()
    return connection
  }

  /** Close the control connection and every conversation connection. */
  closeControlConnection(): void {
    for (const connection of this.conversations.values()) connection.close()
    this.conversations.clear()
    this.control?.connection.close()
    this.control = undefined
  }

  /** Open or return one conversation connection. */
  openConversationConnection(conversationId: ConversationId): ConversationConnection {
    const current = this.conversations.get(conversationId)
    if (current !== undefined) return current
    if (this.control === undefined) {
      throw new HostConnectionStateError({
        message: 'Cannot open a conversation without an active control connection.',
      })
    }

    const socket = this.createClient({
      url: this.conversationConnectionUrl(conversationId),
      subprotocol: HOST_CONVERSATION_SUBPROTOCOL,
      authorization: `Bearer ${this.input.token}`,
    })
    const conversationNotifications = new WebSocketConversationNotifications(socket)
    const connection = new WebSocketConversationConnection({
      socket,
      conversationId,
      context: this.input.resources,
      controlNotifications: this.control.notifications,
      conversationNotifications,
      dispatcher: new JsonRpcConversationDispatcher(this.input.conversationHandlers, {
        conversationId,
        controlNotifications: this.control.notifications,
        conversationNotifications,
        resources: this.input.resources,
      }),
    })

    this.conversations.set(conversationId, connection)
    connection.open()
    void this.observeConversation(conversationId, connection)
    return connection
  }

  /** Close and remove one conversation connection. */
  closeConversationConnection(conversationId: ConversationId): void {
    const connection = this.conversations.get(conversationId)
    if (connection === undefined) return
    this.conversations.delete(conversationId)
    connection.close()
  }

  private async observeConversation(
    conversationId: ConversationId,
    connection: ConversationConnection,
  ): Promise<void> {
    try {
      await connection.closed
    } catch (cause) {
      logger.error('host_conversation_connection_failed', {
        error: cause,
        details: { conversationId },
      })
    } finally {
      if (this.conversations.get(conversationId) === connection) {
        this.conversations.delete(conversationId)
      }
    }
  }

  private controlConnectionUrl(): string {
    const url = new URL('/api/host/ws', this.input.baseUrl)
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
    return url.href
  }

  private conversationConnectionUrl(conversationId: ConversationId): string {
    const url = new URL(this.controlConnectionUrl())
    url.pathname = `${url.pathname.replace(/\/$/, '')}/sub/conversation-agent/${encodeURIComponent(conversationId)}`
    return url.href
  }
}
