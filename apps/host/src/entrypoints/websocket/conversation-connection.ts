import type { IMessageBus } from '@host/application/message-bus.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import { createCommand } from '@host/domain/messages/types.ts'
import type { ConversationMethodHandlerRegistry } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { createJsonRpcHandler } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import type { RelaySocket } from '@host/infrastructure/websocket/party-socket-transport.ts'
import { createConversationNotifications } from '@host/infrastructure/websocket/websocket-notifications.ts'
import {
  HostConversationMethods,
  HostOfflineError,
  HostRequestIdSchema,
  type ConversationId,
} from '@porte/core/client'

/** Owns one conversation JSON-RPC endpoint and its socket. */
export class ConversationConnection {
  readonly notifications: ConversationNotifications
  /** Settles once, when this conversation socket will not come back. */
  readonly stopped: Promise<void>
  /** Settles once the socket is up and the conversation is open; the attach answer waits on it. */
  readonly ready: Promise<void>
  private readonly readyState = Promise.withResolvers<void>()
  private readonly onFrame: ReturnType<typeof createJsonRpcHandler>
  private readonly onUp: () => Promise<void>

  constructor(
    readonly conversationId: ConversationId,
    cwd: string,
    private readonly transport: RelaySocket,
    handlers: ConversationMethodHandlerRegistry,
    bus: IMessageBus,
  ) {
    this.notifications = createConversationNotifications((frame) => transport.send(frame))
    this.stopped = transport.stopped
    // A socket that dies before its first up answers the waiting attach, not a timeout.
    this.ready = Promise.race([
      this.readyState.promise,
      transport.stopped.then(() => Promise.reject(new HostOfflineError())),
    ])
    this.onFrame = createJsonRpcHandler({
      methods: HostConversationMethods,
      requestId: HostRequestIdSchema,
      handlers,
      notificationHandlers: {},
      context: { conversationId, bus },
    })
    // Every (re)connect opens the conversation; an open one is a no-op.
    this.onUp = async () => {
      await bus.handle(createCommand('OpenConversation', { conversationId, cwd }))
      this.readyState.resolve()
    }
  }

  start(): void {
    this.transport.start({ onFrame: this.onFrame, onUp: this.onUp })
  }

  stop(): void {
    this.transport.stop()
  }
}
