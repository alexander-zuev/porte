import {
  DaemonMessageSchema,
  RoutedRequestSchema,
  type RoutedEvent,
  type RoutedRequest,
  type RoutedResponse,
} from '@porte/core'
import type { CodingSessionEvent } from '@porte/core/coding-session-event'
import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import { HostRelayError } from '../../application/host-error.ts'
import type {
  PorteConnection,
  PorteRelay,
  RunPorteRelay,
} from '../../application/ports/porte-relay.ts'

const MAX_RETRY_DELAY_MS = 5_000
const textFrameSchema = z.string()

type SocketFactory = (url: string, init: WebSocketInit) => WebSocket
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
        event: 'sessions.changed',
        data: { catalog: conversations },
      },
    })
  }

  sendConversationEvent(event: CodingSessionEvent): void {
    this.sendEvent({
      audience: { type: 'session', sessionId: event.sessionId },
      message: { v: 1, type: 'event', event: 'session.event', data: event },
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
  ): Promise<ResultType<void, HostRelayError | THandlerError>> {
    return this.connectWithRetry(input, 0)
  }

  private async connectWithRetry<THandlerError>(
    input: RunPorteRelay<THandlerError>,
    attempt: number,
  ): Promise<ResultType<void, HostRelayError | THandlerError>> {
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
  ): Promise<ResultType<ConnectionEnd, HostRelayError | THandlerError>> {
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
      const settle = (result: ResultType<ConnectionEnd, HostRelayError | THandlerError>): void => {
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

function waitForAbort(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const completed = AbortSignal.any([signal, AbortSignal.timeout(delayMs)])
    completed.addEventListener(
      'abort',
      () => {
        resolve()
      },
      { once: true },
    )
  })
}
