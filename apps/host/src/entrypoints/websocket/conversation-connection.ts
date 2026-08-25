import { attachConversation } from '@host/application/commands/attach-conversation.command.ts'
import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { SessionOperations } from '@host/application/session-supervisor.ts'
import type { ConversationMethodHandlerRegistry } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { createJsonRpcHandler } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import type { RelaySocket } from '@host/infrastructure/websocket/party-socket-transport.ts'
import { createConversationNotifications } from '@host/infrastructure/websocket/websocket-notifications.ts'
import {
  HostConversationMethods,
  HostRequestIdSchema,
  type ConversationId,
} from '@porte/core/client'

/** Owns one conversation JSON-RPC endpoint and its socket. */
export class ConversationConnection {
  /** Settles once, when this conversation socket will not come back. */
  readonly stopped: Promise<void>
  private readonly onFrame: ReturnType<typeof createJsonRpcHandler>
  private readonly onUp: () => Promise<void>

  constructor(
    readonly conversationId: ConversationId,
    private readonly transport: RelaySocket,
    handlers: ConversationMethodHandlerRegistry,
    sessions: SessionOperations,
    controlNotifications: ControlNotifications,
  ) {
    const notifications = createConversationNotifications((frame) => transport.send(frame))
    this.stopped = transport.stopped
    this.onFrame = createJsonRpcHandler({
      methods: HostConversationMethods,
      requestId: HostRequestIdSchema,
      handlers,
      notificationHandlers: {},
      context: { conversationId, sessions },
    })
    this.onUp = () =>
      attachConversation(sessions, controlNotifications, notifications, conversationId)
  }

  start(): void {
    this.transport.start({ onFrame: this.onFrame, onUp: this.onUp })
  }

  stop(): void {
    this.transport.stop()
  }
}
