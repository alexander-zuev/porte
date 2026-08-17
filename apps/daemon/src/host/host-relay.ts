import type { DaemonMessage, RoutedRequest, RoutedResponse } from '@lras/core'
import type { Result } from 'better-result'

import type { HostRelayError } from '../errors.ts'

/** One active connection from the daemon to its Host Durable Object. */
export interface HostConnection {
  send(message: DaemonMessage): void
}

/** Callbacks that the relay invokes after it validates inbound messages. */
export type HostRelayHandlers = {
  onConnected(connection: HostConnection): Promise<void>
  onRequest(request: RoutedRequest): Promise<RoutedResponse>
}

/** Input for one long-running daemon relay connection. */
export type RunHostRelay = {
  relayUrl: string
  token: string
  signal: AbortSignal
  handlers: HostRelayHandlers
}

/** Outbound WebSocket capability required by the host module. */
export interface HostRelay {
  run(input: RunHostRelay): Promise<Result<void, HostRelayError>>
}
