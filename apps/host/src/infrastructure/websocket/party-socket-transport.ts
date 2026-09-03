import type { RelayDropCause, RelayStatusListener } from '@host/application/ports/relay-status.ts'
import {
  HOST_CLI_VERSION_HEADER,
  JsonRpcSendError,
  JsonRpcTextSchema,
  RELAY_RECONNECT,
  createLogger,
  readJsonRpcTextFrame,
  sendJsonRpcFrame,
  type JsonRpcResponse,
} from '@porte/core/client'
import { WebSocket as PartySocket } from 'partysocket'
import { WebSocket as NodeWebSocket } from 'ws'
import { z } from 'zod'

import {
  WebSocketHandlerError,
  WebSocketHandshakeRefused,
  WebSocketProtocolClose,
} from './websocket-errors.ts'

const logger = createLogger('party-socket-transport')

/**
 * Cloudflare closes an idle relay socket after about two minutes, so the ping
 * keeps it open. The pong deadline is how a dead link is found: after sleep or
 * a network change the socket stays OPEN until TCP gives up, minutes later.
 */
export const HEARTBEAT = { pingIntervalMs: 15_000, pongDeadlineMs: 10_000 } as const

/** The slice of a `ws` socket a heartbeat drives; a test fakes exactly this. */
export type HeartbeatSocket = {
  readonly readyState: number
  ping(): void
  terminate(): void
  on(event: 'pong', listener: () => void): void
  once(event: 'close', listener: () => void): void
}

/** Ping on an interval; terminate when the pong is late. Ends with the socket's close. */
export function attachHeartbeat(socket: HeartbeatSocket, timing = HEARTBEAT): void {
  let deadline: NodeJS.Timeout | undefined
  const interval = setInterval(() => {
    // One ping in flight at a time; a late pong ends the socket, not a second ping.
    if (socket.readyState !== NodeWebSocket.OPEN || deadline !== undefined) return
    socket.ping()
    deadline = setTimeout(() => {
      socket.terminate()
    }, timing.pongDeadlineMs)
    deadline.unref()
  }, timing.pingIntervalMs)
  // A pending ping is not work the process should stay alive for.
  interval.unref()
  socket.on('pong', () => {
    clearTimeout(deadline)
    deadline = undefined
  })
  socket.once('close', () => {
    clearInterval(interval)
    clearTimeout(deadline)
  })
}

/** Input that creates one authenticated PartySocket. */
export type PartySocketTransportInput = {
  readonly url: string
  readonly subprotocol: string
  readonly authorization: `Bearer ${string}`
  /** This build's version, told to the relay on the upgrade. */
  readonly cliVersion: string
}

/** Consumers of one relay socket. */
export type RelaySocketListeners = {
  /** Handle one inbound text frame. Return a response to write, or nothing. */
  readonly onFrame: (frame: string) => Promise<JsonRpcResponse<unknown, unknown> | undefined>
  /** Handle the first open and every reconnect. */
  readonly onUp?: () => Promise<void>
  /** Watch the socket's state; the CLI renders it. Terminal failures reject `stopped` instead. */
  readonly onStatus?: RelayStatusListener
}

/**
 * One WebSocket to the relay.
 *
 * The socket is inert until `start`. `stopped` settles once, when this socket
 * will not come back. PartySocket owns connect and reconnect.
 */
export interface RelaySocket {
  /** Settles once, when this socket will not come back. */
  readonly stopped: Promise<void>

  /** Attach listeners and start connecting. Does not wait for open. */
  start(listeners: RelaySocketListeners): void

  /** Send one text frame. Retries only when the socket did not accept it. */
  send(frame: string): Promise<void>

  /** Stop reconnects and close locally. */
  stop(): void
}

/** Create one relay socket. */
export type RelaySocketFactory = (input: PartySocketTransportInput) => RelaySocket

type Handshake =
  | { readonly retry: true; readonly status: number }
  | { readonly retry: false; readonly status: number; readonly error: WebSocketHandshakeRefused }

type NodeWebSocketConstructor = new (
  address: string | URL,
  protocols?: string | string[],
) => NodeWebSocket

type RelayPartySocket = EventTarget & {
  readonly retryCount: number
  reconnect(): void
  send(data: string): boolean | void
  close(code?: number, reason?: string): void
}

const InboundMessageSchema = z.object({ data: z.unknown() })
const InboundCloseSchema = z.object({
  code: z.number(),
  reason: z.string(),
})
const InboundErrorSchema = z.object({
  error: z.unknown().optional(),
  message: z.string().optional(),
})

/** Own one authenticated PartySocket and all WebSocket lifecycle work. */
export class PartySocketTransport implements RelaySocket {
  private readonly stoppedState = Promise.withResolvers<void>()
  private readonly socket: RelayPartySocket
  private listeners: RelaySocketListeners | undefined
  private closed = false
  private handshake: Handshake | undefined
  private up: Promise<void> = Promise.resolve()

  /** Settles once, when this socket will not come back. */
  readonly stopped = this.stoppedState.promise

  constructor(
    private readonly input: PartySocketTransportInput,
    socket?: RelayPartySocket,
  ) {
    this.socket = socket ?? this.createSocket()
  }

  /** Attach listeners and start connecting. Does not wait for open. */
  start(listeners: RelaySocketListeners): void {
    this.listeners = listeners
    logger.debug('websocket_connecting', {
      url: this.input.url,
      subprotocol: this.input.subprotocol,
    })
    listeners.onStatus?.({ type: 'connecting' })
    this.socket.addEventListener('open', this.onOpen)
    this.socket.addEventListener('message', this.onMessage)
    this.socket.addEventListener('error', this.onError)
    this.socket.addEventListener('close', this.onClose)
    this.socket.reconnect()
  }

  /** Send one text frame. Retries only when the socket did not accept it. */
  async send(frame: string): Promise<void> {
    await sendJsonRpcFrame(() => this.socket.send(frame))
  }

  /** Stop reconnects and close locally. */
  stop(): void {
    this.closed = true
    this.socket.close(1000, 'Host connection closed')
    this.stoppedState.resolve()
  }

  private createSocket(): PartySocket {
    const AuthenticatedWebSocket = authenticatedWebSocketConstructor(
      this.input.authorization,
      this.input.cliVersion,
      this.recordHandshake,
    )
    return new PartySocket(this.input.url, this.input.subprotocol, {
      ...RELAY_RECONNECT,
      WebSocket: AuthenticatedWebSocket,
      maxEnqueuedMessages: 0,
      startClosed: true,
      shouldReconnectOnClose: this.shouldReconnect,
    })
  }

  private readonly onOpen = (): void => {
    if (this.closed) return
    logger.debug('websocket_connected', {
      details: { url: this.input.url, retryCount: this.socket.retryCount },
    })
    this.listeners?.onStatus?.({ type: 'connected', attempt: this.socket.retryCount })
    const onUp = this.listeners?.onUp
    this.up =
      onUp === undefined
        ? Promise.resolve()
        : onUp().catch((cause: unknown) => {
            this.fail(new WebSocketHandlerError({ cause }))
          })
  }

  // Ignore → parse text → close if bad. Next step is JSON-RPC as the server.
  private readonly onMessage = (event: Event): void => {
    if (this.closed) return
    const message = InboundMessageSchema.safeParse(event)
    const parsed = readJsonRpcTextFrame(
      JsonRpcTextSchema.safeParse(message.success ? message.data.data : undefined),
    )
    if (!parsed.ok) {
      logger.warn('websocket_frame_rejected', { details: parsed.close })
      this.socket.close(parsed.close.code, parsed.close.reason)
      return
    }
    void this.deliverFrame(parsed.frame)
  }

  private readonly onError = (event: Event): void => {
    if (this.closed) return
    const parsed = InboundErrorSchema.safeParse(event)
    // The close that follows carries the decision; this is detail for `--verbose`.
    logger.debug('websocket_error', {
      url: this.input.url,
      retryCount: this.socket.retryCount,
      message: parsed.success ? readErrorMessage(parsed.data) : undefined,
    })
  }

  private readonly onClose = (event: Event): void => {
    if (this.closed) return
    const handshake = this.handshake
    this.handshake = undefined
    if (handshake !== undefined && !handshake.retry) {
      this.fail(handshake.error)
      return
    }
    const closed = InboundCloseSchema.safeParse(event)
    const code = closed.success ? closed.data.code : 1006
    const reason = closed.success ? closed.data.reason : ''
    if (isTerminalCloseCode(code)) {
      this.fail(
        new WebSocketProtocolClose({
          message: `WebSocket connection closed: ${reason}`,
        }),
      )
      return
    }
    logger.debug('websocket_reconnecting', {
      url: this.input.url,
      retryCount: this.socket.retryCount,
      handshakeStatus: handshake?.status,
      closeCode: code,
      closeReason: reason,
    })
    this.listeners?.onStatus?.({
      type: 'reconnecting',
      attempt: this.socket.retryCount + 1,
      cause: dropCause(handshake?.status),
    })
  }

  // JSON-RPC as the server: handler may return a response document to write.
  private async deliverFrame(frame: string): Promise<void> {
    await this.up.catch(() => undefined)
    if (this.closed || this.listeners === undefined) return
    try {
      const document = await this.listeners.onFrame(frame)
      if (document !== undefined) await this.send(JSON.stringify(document))
    } catch (cause) {
      this.fail(cause instanceof JsonRpcSendError ? cause : new WebSocketHandlerError({ cause }))
    }
  }

  private readonly recordHandshake = (status: number): void => {
    this.handshake = shouldRetryHandshake(status)
      ? { retry: true, status }
      : { retry: false, status, error: new WebSocketHandshakeRefused({ status }) }
  }

  private readonly shouldReconnect = (event: CloseEvent): boolean => {
    if (this.closed) return false
    const handshake = this.handshake
    if (handshake !== undefined) return handshake.retry
    return !isTerminalCloseCode(event.code)
  }

  private fail(
    cause:
      | WebSocketHandlerError
      | WebSocketHandshakeRefused
      | WebSocketProtocolClose
      | JsonRpcSendError,
  ): void {
    this.closed = true
    this.socket.close(1011, 'WebSocket transport stopped')
    this.stoppedState.reject(cause)
  }
}

/** Create one configured PartySocket. */
export const createPartySocketTransport: RelaySocketFactory = (input) =>
  new PartySocketTransport(input)

function authenticatedWebSocketConstructor(
  authorization: `Bearer ${string}`,
  cliVersion: string,
  recordHandshake: (status: number) => void,
): NodeWebSocketConstructor {
  return class AuthenticatedWebSocket extends NodeWebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
      super(address, protocols ?? [], {
        headers: { Authorization: authorization, [HOST_CLI_VERSION_HEADER]: cliVersion },
      })
      this.once('unexpected-response', (_request, response) => {
        recordHandshake(response.statusCode ?? 0)
        response.resume()
        this.close()
      })
      this.once('open', () => {
        attachHeartbeat(this)
      })
    }
  }
}

/**
 * A 5xx handshake means the relay's edge answered but the app behind it did
 * not (Cloudflare 530 through a tunnel, 502/503 on deploy). Anything else is
 * the network between here and there.
 */
export function dropCause(handshakeStatus: number | undefined): RelayDropCause {
  return handshakeStatus !== undefined && handshakeStatus >= 500
    ? 'server-unreachable'
    : 'connection-lost'
}

function isTerminalCloseCode(code: number): boolean {
  return code === 1002 || code === 1003 || code === 1007 || code === 1008 || code === 1009
}

function shouldRetryHandshake(status: number): boolean {
  return (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  )
}

function readErrorMessage(event: z.infer<typeof InboundErrorSchema>): string | undefined {
  if (event.message !== undefined) return event.message
  return event.error instanceof Error ? event.error.message : undefined
}
