import { DaemonMessageSchema, RoutedRequestSchema } from '@lras/core'
import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import { HostRelayError } from '../errors.ts'
import type { HostConnection, HostRelay, RunHostRelay } from './host-relay.ts'

const MAX_RETRY_DELAY_MS = 5_000

export type HostRelayObserver = {
  connected(): void
  reconnecting(delayMs: number): void
}

type SocketFactory = (url: string, init: WebSocketInit) => WebSocket
type ConnectionEnd = 'aborted' | 'closed'

const textFrameSchema = z.string()

/** Native WebSocket adapter for the daemon's outbound host connection. */
export class WebSocketHostRelay implements HostRelay {
  constructor(
    private readonly observer: HostRelayObserver,
    private readonly createSocket: SocketFactory = (url, init) => new WebSocket(url, init),
  ) {}

  async run(input: RunHostRelay): Promise<ResultType<void, HostRelayError>> {
    return this.connectWithRetry(input, 0)
  }

  private async connectWithRetry(
    input: RunHostRelay,
    attempt: number,
  ): Promise<ResultType<void, HostRelayError>> {
    if (input.signal.aborted) return Result.ok()
    const connected = await this.connectOnce(input)
    if (connected.isErr()) return Result.err(connected.error)
    if (connected.value === 'aborted') return Result.ok()

    const delayMs = retryDelayMs(attempt)
    this.observer.reconnecting(delayMs)
    await waitForAbort(input.signal, delayMs)
    return this.connectWithRetry(input, attempt + 1)
  }

  private connectOnce(input: RunHostRelay): Promise<ResultType<ConnectionEnd, HostRelayError>> {
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
      const settle = (result: ResultType<ConnectionEnd, HostRelayError>): void => {
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
        const connection: HostConnection = {
          send: (message) => {
            socket.send(JSON.stringify(DaemonMessageSchema.parse(message)))
          },
        }
        void input.handlers.onConnected(connection).catch(fail)
      })
      socket.addEventListener('message', (event) => {
        const frame = textFrameSchema.safeParse(event.data)
        if (!frame.success) {
          socket.close(1003, 'text messages required')
          return
        }
        void handleRequest(socket, frame.data, input).catch(fail)
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

async function handleRequest(socket: WebSocket, raw: string, input: RunHostRelay): Promise<void> {
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
  const response = await input.handlers.onRequest(parsed.data)
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
