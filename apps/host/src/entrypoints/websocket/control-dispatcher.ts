import {
  type ControlMethodContext,
  type ControlMethodHandler,
  type ControlMethodHandlerRegistry,
} from '@host/entrypoints/websocket/control-method-handlers.ts'
import {
  parseWebSocketMessage,
  sendProtocolError,
} from '@host/entrypoints/websocket/websocket-error-boundary.ts'
import type { WebSocketClient } from '@host/infrastructure/websocket/party-socket-client.ts'
import { JsonRpcRequestSchema, JSON_RPC_ERROR_CODES } from '@porte/core/client'

/** Dispatch raw control messages to method handlers. */
export interface ControlMessageDispatcher {
  /** Parse and dispatch one control message event. */
  dispatch(event: MessageEvent, socket: WebSocketClient): Promise<void>
}

/** JSON-RPC dispatcher for the Host control connection. */
export class JsonRpcControlDispatcher implements ControlMessageDispatcher {
  private readonly handlers: ReadonlyMap<string, ControlMethodHandler>

  constructor(
    handlers: ControlMethodHandlerRegistry,
    private readonly context: ControlMethodContext,
  ) {
    this.handlers = new Map(Object.entries(handlers))
  }

  /** Parse and dispatch one control message event. */
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
