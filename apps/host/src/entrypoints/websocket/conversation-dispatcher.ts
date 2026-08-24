import {
  type ConversationMethodContext,
  type ConversationMethodHandler,
  type ConversationMethodHandlerRegistry,
} from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import {
  parseWebSocketMessage,
  sendProtocolError,
} from '@host/entrypoints/websocket/websocket-error-boundary.ts'
import type { WebSocketClient } from '@host/infrastructure/websocket/party-socket-client.ts'
import { JsonRpcRequestSchema, JSON_RPC_ERROR_CODES } from '@porte/core/client'

/** Dispatch raw conversation messages to method handlers. */
export interface ConversationMessageDispatcher {
  /** Parse and dispatch one conversation message event. */
  dispatch(event: MessageEvent, socket: WebSocketClient): Promise<void>
}

/** JSON-RPC dispatcher for one Host conversation connection. */
export class JsonRpcConversationDispatcher implements ConversationMessageDispatcher {
  private readonly handlers: ReadonlyMap<string, ConversationMethodHandler>

  constructor(
    handlers: ConversationMethodHandlerRegistry,
    private readonly context: ConversationMethodContext,
  ) {
    this.handlers = new Map(Object.entries(handlers))
  }

  /** Parse and dispatch one conversation message event. */
  async dispatch(event: MessageEvent, socket: WebSocketClient): Promise<void> {
    const document = parseWebSocketMessage(event, socket)
    if (document === undefined) return
    const request = JsonRpcRequestSchema.safeParse(document)
    if (!request.success) {
      sendProtocolError(socket, null, JSON_RPC_ERROR_CODES.invalidRequest, 'Invalid Request')
      return
    }

    const handler = this.handlers.get(request.data.method)
    if (handler === undefined) {
      sendProtocolError(
        socket,
        request.data.id,
        JSON_RPC_ERROR_CODES.methodNotFound,
        'Method not found',
      )
      return
    }

    await handler(document, socket, this.context)
  }
}
