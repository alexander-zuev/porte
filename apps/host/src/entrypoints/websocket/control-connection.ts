import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { RelayStatusListener } from '@host/application/ports/relay-status.ts'
import type {
  ControlMethodContext,
  ControlMethodHandlerRegistry,
} from '@host/entrypoints/websocket/control-method-handlers.ts'
import { createJsonRpcHandler } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import type { RelaySocket } from '@host/infrastructure/websocket/party-socket-transport.ts'
import {
  createControlNotifications,
  createNotificationSequence,
} from '@host/infrastructure/websocket/websocket-notifications.ts'
import { HostControlMethods, HostRequestIdSchema } from '@porte/core/client'

/** Owns the control JSON-RPC endpoint and its socket. */
export class ControlConnection {
  readonly notifications: ControlNotifications
  readonly stopped: Promise<void>
  private readonly sequence = createNotificationSequence()
  private readonly onFrame: ReturnType<typeof createJsonRpcHandler>

  constructor(
    private readonly transport: RelaySocket,
    handlers: ControlMethodHandlerRegistry,
    context: ControlMethodContext,
  ) {
    this.notifications = createControlNotifications((frame) => transport.send(frame), this.sequence)
    this.stopped = transport.stopped
    this.onFrame = createJsonRpcHandler({
      methods: HostControlMethods,
      requestId: HostRequestIdSchema,
      handlers,
      notificationHandlers: {
        'version.latest': (params) => context.onLatestVersion(params.latest),
      },
      context,
    })
  }

  start(onStatus?: RelayStatusListener): void {
    this.transport.start({
      onFrame: this.onFrame,
      onStatus,
      // Every open is a new socket on the relay side; its `seq` starts at 1 again.
      onUp: async () => {
        this.sequence.restart()
      },
    })
  }

  stop(): void {
    this.transport.stop()
  }
}
