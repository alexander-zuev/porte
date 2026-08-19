import {
  DaemonMessageSchema,
  RoutedRequestSchema,
  RoutedResponseSchema,
  type RoutedEvent,
} from '@porte/core'
import type { CodingSessionEvent } from '@porte/core/coding-session-event'
import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import type {
  HostEventPublisher,
  HostRelay,
  HostRelayObserver,
  RunHostRelay,
} from '../../application/ports/host-relay.ts'
import { HostRelayError } from '../../errors.ts'

const MAX_RETRY_DELAY_MS = 5_000

type SocketFactory = (url: string, init: WebSocketInit) => WebSocket
type ConnectionEnd = 'aborted' | 'closed'

const textFrameSchema = z.string()

/** WebSocket publisher that converts host events to routed protocol events. */
export class WebSocketHostEventPublisher implements HostEventPublisher {
  constructor(private readonly send: (frame: string) => void) {}

  /** Publish the complete current session catalog. */
  sessionsChanged(catalog: Parameters<HostEventPublisher['sessionsChanged']>[0]): void {
    this.sendEvent({
      audience: { type: 'host' },
      message: { v: 1, type: 'event', event: 'sessions.changed', data: { catalog } },
    })
  }

  /** Publish one canonical event for a coding session. */
  sessionEvent(event: CodingSessionEvent): void {
    this.sendEvent({
      audience: { type: 'session', sessionId: event.sessionId },
      message: { v: 1, type: 'event', event: 'session.event', data: event },
    })
  }

  private sendEvent(event: RoutedEvent): void {
    this.send(JSON.stringify(DaemonMessageSchema.parse(event)))
  }
}

/** Native WebSocket adapter for the daemon's outbound host connection. */
export class WebSocketHostRelay implements HostRelay {
  constructor(
    private readonly observer: HostRelayObserver,
    private readonly createSocket: SocketFactory = (url, init) => new WebSocket(url, init),
  ) {}

  /** Run the WebSocket relay until the signal stops it or a failure occurs. */
  async run<THandlerError>(
    input: RunHostRelay<THandlerError>,
  ): Promise<ResultType<void, HostRelayError | THandlerError>> {
    return this.connectWithRetry(input, 0)
  }

  private async connectWithRetry<THandlerError>(
    input: RunHostRelay<THandlerError>,
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
    input: RunHostRelay<THandlerError>,
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
        socket.close(1000, 'daemon stopped')
        settle(Result.ok('aborted'))
      }

      input.signal.addEventListener('abort', onAbort, { once: true })
      socket.addEventListener('open', () => {
        this.observer.connected()
        const publisher = new WebSocketHostEventPublisher((frame) => {
          socket.send(frame)
        })
        void input.handlers
          .onConnected(publisher)
          .then((handled) => {
            if (handled.isErr()) {
              settle(Result.err(handled.error))
              socket.close(1011, 'host handler failed')
            }
            return undefined
          })
          .catch(fail)
      })
      socket.addEventListener('message', (event) => {
        const frame = textFrameSchema.safeParse(event.data)
        if (!frame.success) {
          socket.close(1003, 'text messages required')
          return
        }
        void handleRequest(socket, frame.data).catch(fail)
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

async function handleRequest(socket: WebSocket, raw: string): Promise<void> {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    socket.close(1007, 'invalid JSON')
    return
  }
  const parsed = RoutedRequestSchema.safeParse(value)
  if (!parsed.success) {
    socket.close(1007, 'invalid host request')
    return
  }
  const response = RoutedResponseSchema.parse({
    route: parsed.data.route,
    method: parsed.data.message.method,
    message: {
      v: 1,
      type: 'error',
      requestId: parsed.data.message.requestId,
      error: { code: 'GROK_UNAVAILABLE', message: 'Session control is not available' },
    },
  })
  socket.send(JSON.stringify(DaemonMessageSchema.parse(response)))
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
