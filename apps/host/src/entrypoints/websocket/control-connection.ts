import type { ControlMessageDispatcher } from '@host/entrypoints/websocket/control-dispatcher.ts'
import {
  HostWebSocketError,
  RelayHandshakeRefused,
  RelayProtocolError,
} from '@host/entrypoints/websocket/websocket-errors.ts'
import {
  isTerminalWebSocketCloseCode,
  type WebSocketClient,
} from '@host/infrastructure/websocket/party-socket-client.ts'
import {
  createLogger,
  RelayHeartbeat,
  RELAY_HEARTBEAT_REQUEST,
  RELAY_HEARTBEAT_RESPONSE,
} from '@porte/core/client'

const logger = createLogger('host-control-connection')

/** One active Host control connection. */
export interface ControlConnection {
  /** Resolve on an intentional close and reject on a terminal failure. */
  readonly closed: Promise<void>

  /** Attach the WebSocket listeners. */
  open(): void

  /** Remove listeners and close the WebSocket. */
  close(): void
}

/** Dependencies for one WebSocket control connection. */
export type WebSocketControlConnectionInput = {
  readonly dispatcher: ControlMessageDispatcher
  readonly socket: WebSocketClient
}

/** Own the listeners and heartbeat for one control WebSocket. */
export class WebSocketControlConnection implements ControlConnection {
  private readonly completion = Promise.withResolvers<void>()
  private active = false
  private settled = false
  private heartbeat: RelayHeartbeat | undefined
  private work = Promise.resolve()

  readonly closed = this.completion.promise

  constructor(private readonly input: WebSocketControlConnectionInput) {}

  /** Attach the WebSocket listeners. */
  open(): void {
    if (this.active) return
    this.active = true
    this.input.socket.addEventListener('open', this.onOpen)
    this.input.socket.addEventListener('message', this.onMessage)
    this.input.socket.addEventListener('close', this.onClose)
  }

  /** Remove listeners and close the WebSocket. */
  close(): void {
    if (!this.active && this.settled) return
    this.detach()
    this.input.socket.close(1000, 'host stopped')
    this.resolve()
  }

  private readonly onOpen = (): void => {
    this.heartbeat?.stop()
    this.heartbeat = new RelayHeartbeat(
      () => this.input.socket.send(RELAY_HEARTBEAT_REQUEST),
      () => {
        this.input.socket.reconnect(1011, 'control heartbeat expired')
      },
    )
    this.heartbeat.start()
    logger.info('host_connected')
  }

  private readonly onMessage = (event: MessageEvent): void => {
    if (event.data === RELAY_HEARTBEAT_RESPONSE) {
      this.heartbeat?.acknowledge()
      return
    }

    this.work = this.work
      .then(() => this.input.dispatcher.dispatch(event, this.input.socket))
      .catch((cause: unknown) => {
        this.reject(new HostWebSocketError({ cause }))
      })
  }

  private readonly onClose = (event: CloseEvent): void => {
    this.heartbeat?.stop()
    const failure = this.input.socket.connectionFailure
    if (failure !== undefined) {
      this.reject(new RelayHandshakeRefused({ status: failure.status }))
      return
    }
    if (isTerminalWebSocketCloseCode(event.code)) {
      this.reject(new RelayProtocolError({ message: `Control connection closed: ${event.reason}` }))
      return
    }
    logger.info('host_reconnecting', {
      delayMs: retryDelayMs(this.input.socket.retryCount),
    })
  }

  private detach(): void {
    this.active = false
    this.heartbeat?.stop()
    this.input.socket.removeEventListener('open', this.onOpen)
    this.input.socket.removeEventListener('message', this.onMessage)
    this.input.socket.removeEventListener('close', this.onClose)
  }

  private resolve(): void {
    if (this.settled) return
    this.settled = true
    this.detach()
    this.completion.resolve()
  }

  private reject(cause: unknown): void {
    if (this.settled) return
    this.settled = true
    this.detach()
    this.input.socket.close(1011, 'control connection stopped')
    this.completion.reject(cause)
  }
}

/** Return PartySocket's bounded reconnect delay for CLI output. */
export function retryDelayMs(attempt: number): number {
  return attempt <= 0 ? 0 : Math.min(250 * 2 ** (attempt - 1), 5_000)
}
