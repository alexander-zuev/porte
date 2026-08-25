import { attachConversation } from '@host/application/commands/attach-conversation.command.ts'
import type { ConversationCatalog } from '@host/application/conversation-catalog.ts'
import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { SessionOperations } from '@host/application/session-supervisor.ts'
import type { ConversationMethodHandlerRegistry } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { createJsonRpcHandler } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import type { RelaySocket } from '@host/infrastructure/websocket/party-socket-transport.ts'
import { createConversationNotifications } from '@host/infrastructure/websocket/websocket-notifications.ts'
import {
  HostConversationMethods,
  HostRequestIdSchema,
  createLogger,
  type ConversationId,
} from '@porte/core/client'

const logger = createLogger('conversation-connection')

/** Owns one conversation JSON-RPC endpoint and its socket. */
export class ConversationConnection {
  private readonly onFrame: ReturnType<typeof createJsonRpcHandler>
  private readonly onUp: () => Promise<void>

  constructor(
    readonly conversationId: ConversationId,
    private readonly transport: RelaySocket,
    handlers: ConversationMethodHandlerRegistry,
    sessions: SessionOperations,
    catalog: ConversationCatalog,
    controlNotifications: ControlNotifications,
    onStopped: (connection: ConversationConnection) => void,
  ) {
    const notifications = createConversationNotifications((frame) => transport.send(frame))
    this.onFrame = createJsonRpcHandler({
      methods: HostConversationMethods,
      requestId: HostRequestIdSchema,
      handlers,
      context: { conversationId, sessions },
    })
    this.onUp = () =>
      attachConversation(sessions, catalog, controlNotifications, notifications, conversationId)
    void transport.stopped.then(
      () => {
        onStopped(this)
        return undefined
      },
      (cause: unknown) => {
        logger.error('host_conversation_connection_failed', {
          error: cause,
          details: { conversationId },
        })
        onStopped(this)
        return undefined
      },
    )
  }

  start(): void {
    this.transport.start({ onFrame: this.onFrame, onUp: this.onUp })
  }

  stop(): void {
    this.transport.stop()
  }
}
