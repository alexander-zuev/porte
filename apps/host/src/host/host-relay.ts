import type { DaemonMessage, RoutedRequest, RoutedResponse } from '@porte/core'
import type { Result } from 'better-result'

import type { HostRelayError } from '../errors.ts'

/** One active connection from the daemon to its Host Durable Object. */
export interface HostConnection {
  /** Send one validated protocol message. */
  send(message: DaemonMessage): void
}

/** Relay lifecycle events observed by the process entrypoint. */
export interface HostRelayObserver {
  /** Report that the relay connection is open. */
  connected(): void

  /** Report the delay before the next connection attempt. */
  reconnecting(delayMs: number): void
}

/** Callbacks that the relay invokes after it validates inbound messages. */
export type HostRelayHandlers<THandlerError> = {
  readonly onConnected: (connection: HostConnection) => Promise<Result<void, THandlerError>>
  readonly onRequest: (request: RoutedRequest) => Promise<RoutedResponse>
}

/** Input for one long-running daemon relay connection. */
export type RunHostRelay<THandlerError> = {
  readonly relayUrl: string
  readonly token: string
  readonly signal: AbortSignal
  readonly handlers: HostRelayHandlers<THandlerError>
}

/** Outbound WebSocket capability required by the host module. */
export interface HostRelay {
  /** Run the relay until the signal stops it or a failure occurs. */
  run<THandlerError>(
    input: RunHostRelay<THandlerError>,
  ): Promise<Result<void, HostRelayError | THandlerError>>
}
