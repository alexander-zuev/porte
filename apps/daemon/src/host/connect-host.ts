import {
  IsoDateTimeSchema,
  RoutedResponseSchema,
  type IsoDateTime,
  type RoutedEvent,
  type RoutedRequest,
  type RoutedResponse,
  type SessionSummary,
} from '@lras/core'
import type { Result as ResultType } from 'better-result'

import type { HostRelayError } from '../errors.ts'
import type { HostConnection, HostRelay } from './host-relay.ts'

/** Session catalog capability required when the daemon connects. */
export interface SessionCatalogReader {
  list(): Promise<SessionSummary[]>
}

/** Clock capability required for catalog observations. */
export interface HostClock {
  now(): IsoDateTime
}

export type ConnectHostDeps = {
  sessions: SessionCatalogReader
  clock: HostClock
  relay: HostRelay
}

export type ConnectHostCommand = {
  relayUrl: string
  token: string
  signal: AbortSignal
}

/** Connect the daemon and publish current host state after each reconnect. */
export async function connectHost(
  command: ConnectHostCommand,
  deps: ConnectHostDeps,
): Promise<ResultType<void, HostRelayError>> {
  return deps.relay.run({
    ...command,
    handlers: {
      onConnected: async (connection) => publishCatalog(connection, deps),
      onRequest: async (request) => unavailableResponse(request),
    },
  })
}

async function publishCatalog(
  connection: HostConnection,
  deps: Pick<ConnectHostDeps, 'sessions' | 'clock'>,
): Promise<void> {
  const message: RoutedEvent = {
    audience: { type: 'host' },
    message: {
      v: 1,
      type: 'event',
      event: 'sessions.changed',
      data: {
        catalog: {
          state: 'synced',
          sessions: await deps.sessions.list(),
          observedAt: deps.clock.now(),
        },
      },
    },
  }
  connection.send(message)
}

function unavailableResponse(request: RoutedRequest): RoutedResponse {
  return RoutedResponseSchema.parse({
    route: request.route,
    method: request.message.method,
    message: {
      v: 1,
      type: 'error',
      requestId: request.message.requestId,
      error: { code: 'GROK_UNAVAILABLE', message: 'Session control is not available' },
    },
  })
}

/** System clock that validates each timestamp against the public contract. */
export class SystemHostClock implements HostClock {
  now(): IsoDateTime {
    return IsoDateTimeSchema.parse(new Date().toISOString())
  }
}
