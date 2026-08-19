import type { SessionCatalog } from '@porte/core'
import type { CodingSessionEvent } from '@porte/core/coding-session-event'
import type { Result } from 'better-result'

import type { HostRelayError } from '../../errors.ts'

/** Canonical host events published through one active relay connection. */
export interface HostEventPublisher {
  /** Publish the complete current session catalog. */
  sessionsChanged(catalog: Extract<SessionCatalog, { state: 'synced' }>): void

  /** Publish one canonical event for a coding session. */
  sessionEvent(event: CodingSessionEvent): void
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
  readonly onConnected: (publisher: HostEventPublisher) => Promise<Result<void, THandlerError>>
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
