import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { RelayStatusListener } from '@host/application/ports/relay-status.ts'
import type {
  ControlMethodContext,
  ControlMethodHandlerRegistry,
} from '@host/entrypoints/websocket/control-method-handlers.ts'
import { createJsonRpcHandler } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import type { RelaySocket } from '@host/infrastructure/websocket/party-socket-transport.ts'
import { createControlNotifications } from '@host/infrastructure/websocket/websocket-notifications.ts'
import { HostControlMethods, HostRequestIdSchema } from '@porte/core/client'

/** Owns the control JSON-RPC endpoint and its socket. */
export class ControlConnection {
  readonly notifications: ControlNotifications
  readonly stopped: Promise<void>
  private readonly onFrame: ReturnType<typeof createJsonRpcHandler>

  constructor(
    private readonly transport: RelaySocket,
    handlers: ControlMethodHandlerRegistry,
    context: ControlMethodContext,
  ) {
    this.notifications = createControlNotifications((frame) => transport.send(frame))
    this.stopped = transport.stopped
    this.onFrame = createJsonRpcHandler({
      methods: HostControlMethods,
      requestId: HostRequestIdSchema,
      handlers,
      notificationHandlers: {},
      context,
    })
  }

  start(onStatus?: RelayStatusListener): void {
    this.transport.start({ onFrame: this.onFrame, onStatus })
  }

  stop(): void {
    this.transport.stop()
  }
}
