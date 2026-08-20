import { HostRelayError, RelayHandshakeRefused } from '@host/application/host-error.ts'
import type {
  PorteConnection,
  PorteRelay,
  RunPorteRelay,
} from '@host/application/ports/porte-relay.ts'
import {
  DaemonMessageSchema,
  RoutedRequestSchema,
  type RoutedEvent,
  type RoutedRequest,
  type RoutedResponse,
} from '@porte/core'
import type { ConversationEvent } from '@porte/core/conversation-event'
import { Result, type Result as ResultType } from 'better-result'
// Node's own WebSocket follows the browser constructor, whose second argument is
// the subprotocol list. It drops an options object without a word, so the bearer
// token never left this machine. `ws` is the client that can carry a header.
import { WebSocket, type ClientOptions } from 'ws'
import { z } from 'zod'

const MAX_RETRY_DELAY_MS = 5_000
const textFrameSchema = z.string()

type SocketFactory = (url: string, init: ClientOptions) => WebSocket
type ConnectionEnd = 'aborted' | 'closed'

/** Optional connection status output owned by the WebSocket adapter. */
export interface PorteRelayObserver {
  connected(): void
  reconnecting(delayMs: number): void
}

/** Sends validated Porte messages through one WebSocket. */
export class WebSocketPorteConnection implements PorteConnection {
  constructor(private readonly send: (frame: string) => void) {}

  sendConversations(conversations: Parameters<PorteConnection['sendConversations']>[0]): void {
    this.sendEvent({
      audience: { type: 'host' },
      message: {
        v: 1,
        type: 'event',
        event: 'conversations.changed',
        data: { catalog: conversations },
      },
    })
  }

  sendConversationEvent(event: ConversationEvent): void {
    this.sendEvent({
      audience: { type: 'conversation', conversationId: event.conversationId },
      message: { v: 1, type: 'event', event: 'conversation.event', data: event },
    })
  }

  sendResponse(response: RoutedResponse): void {
    this.send(JSON.stringify(DaemonMessageSchema.parse(response)))
  }

  private sendEvent(event: RoutedEvent): void {
    this.send(JSON.stringify(DaemonMessageSchema.parse(event)))
  }
}

/** Connects the host to Porte through an authenticated WebSocket. */
export class WebSocketPorteRelay implements PorteRelay {
  constructor(
    private readonly observer: PorteRelayObserver,
    private readonly createSocket: SocketFactory = (url, init) => new WebSocket(url, init),
  ) {}

  async run<THandlerError>(
    input: RunPorteRelay<THandlerError>,
  ): Promise<ResultType<void, HostRelayError | RelayHandshakeRefused | THandlerError>> {
    return this.connectWithRetry(input, 0)
  }

  private async connectWithRetry<THandlerError>(
    input: RunPorteRelay<THandlerError>,
    attempt: number,
  ): Promise<ResultType<void, HostRelayError | RelayHandshakeRefused | THandlerError>> {
    if (input.signal.aborted) return Result.ok()
    const connected = await this.connectOnce(input)
    if (connected.isErr()) return Result.err(connected.error)
    if (connected.value === 'aborted') return Result.ok()

    const delayMs = retryDelayMs(attempt)
    this.observer.reconnecting(delayMs)
    await waitForAbort(input.signal, delayMs)
    return this.connectWithRetry(input, attempt + 1)
  }

  private connectOnce<THandlerError>(
    input: RunPorteRelay<THandlerError>,
  ): Promise<ResultType<ConnectionEnd, HostRelayError | RelayHandshakeRefused | THandlerError>> {
    return new Promise((resolve) => {
      let socket: WebSocket
      try {
        socket = this.createSocket(input.relayUrl, {
          headers: { Authorization: `Bearer ${input.token}` },
        })
      } catch (cause) {
        resolve(Result.err(new HostRelayError({ cause })))
        return
      }

      let settled = false
      const settle = (
        result: ResultType<ConnectionEnd, HostRelayError | RelayHandshakeRefused | THandlerError>,
      ): void => {
        if (settled) return
        settled = true
        input.signal.removeEventListener('abort', onAbort)
        resolve(result)
      }
      const fail = (cause: unknown): void => {
        socket.close(1011, 'host handler failed')
        settle(Result.err(new HostRelayError({ cause })))
      }
      const onAbort = (): void => {
        socket.close(1000, 'host stopped')
        settle(Result.ok('aborted'))
      }

      input.signal.addEventListener('abort', onAbort, { once: true })
      socket.addEventListener('open', () => {
        this.observer.connected()
        const connection = new WebSocketPorteConnection((frame) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(frame)
        })
        void input.handlers
          .onConnected(connection)
          .then((handled) => {
            if (handled.isErr()) {
              socket.close(1011, 'host handler failed')
              settle(Result.err(handled.error))
            }
            return undefined
          })
          .catch(fail)

        socket.addEventListener('message', (event) => {
          const text = textFrameSchema.safeParse(event.data)
          if (!text.success) {
            socket.close(1003, 'text messages required')
            return
          }
          const request = parseRequest(socket, text.data)
          if (request === undefined) return
          void input.handlers
            .onRequest(request, connection)
            .then((handled) => {
              if (handled.isErr()) {
                socket.close(1011, 'host handler failed')
                settle(Result.err(handled.error))
              }
              return undefined
            })
            .catch(fail)
        })
      })
      // The server answered the handshake with a status instead of upgrading.
      // A refused credential never becomes accepted by asking again, so this
      // stops rather than joining the reconnect loop.
      socket.on('unexpected-response', (_request, response) => {
        socket.close()
        settle(Result.err(new RelayHandshakeRefused({ status: response.statusCode ?? 0 })))
      })
      socket.addEventListener('error', () => {
        socket.close()
      })
      socket.addEventListener('close', () => {
        settle(Result.ok('closed'))
      })
    })
  }
}

function parseRequest(socket: WebSocket, frame: string): RoutedRequest | undefined {
  let json: unknown
  try {
    json = JSON.parse(frame)
  } catch {
    socket.close(1007, 'invalid JSON')
    return undefined
  }
  const parsed = RoutedRequestSchema.safeParse(json)
  if (!parsed.success) {
    socket.close(1007, 'invalid host request')
    return undefined
  }
  return parsed.data
}

export function retryDelayMs(attempt: number): number {
  return Math.min(250 * 2 ** attempt, MAX_RETRY_DELAY_MS)
}

/**
 * Hold for the backoff, or stop early when the caller aborts.
 *
 * A plain timer rather than `AbortSignal.timeout`, whose timer Node does not
 * count as work: with nothing else pending, the loop drained mid-backoff and
 * the process exited on an unsettled await instead of reconnecting.
 */
function waitForAbort(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(finish, delayMs)
    signal.addEventListener('abort', finish, { once: true })

    function finish(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
  })
}
