import {
  RoutedResponseSchema,
  type IsoDateTime,
  type RoutedEvent,
  type RoutedRequest,
  type RoutedResponse,
  type SessionSummary,
} from '@porte/core'
import { Result, type Result as ResultType } from 'better-result'

import type { HostRelayError, SessionStoreError } from '../errors.ts'
import type { HostConnection, HostRelay } from './host-relay.ts'

/** Session catalog capability required when the host connects. */
export interface SessionCatalogReader {
  /** List current session summaries. */
  list(): Promise<ResultType<SessionSummary[], SessionStoreError>>
}

/** Clock capability required for catalog observations. */
export interface HostClock {
  /** Return the current protocol time. */
  now(): IsoDateTime
}

/** Input required to connect the local host. */
export type ConnectHostCommand = {
  readonly relayUrl: string
  readonly token: string
  readonly signal: AbortSignal
}

/** Connects the local host and publishes its session catalog. */
export class HostConnector {
  constructor(
    private readonly sessions: SessionCatalogReader,
    private readonly clock: HostClock,
    private readonly relay: HostRelay,
  ) {}

  /** Connect the host and publish current state after each reconnect. */
  connect(
    command: ConnectHostCommand,
  ): Promise<ResultType<void, HostRelayError | SessionStoreError>> {
    return this.relay.run({
      ...command,
      handlers: {
        onConnected: async (connection) => this.publishCatalog(connection),
        onRequest: async (request) => unavailableResponse(request),
      },
    })
  }

  private async publishCatalog(
    connection: HostConnection,
  ): Promise<ResultType<void, SessionStoreError>> {
    const sessions = await this.sessions.list()
    if (sessions.isErr()) return Result.err(sessions.error)

    const message: RoutedEvent = {
      audience: { type: 'host' },
      message: {
        v: 1,
        type: 'event',
        event: 'sessions.changed',
        data: {
          catalog: {
            state: 'synced',
            sessions: sessions.value,
            observedAt: this.clock.now(),
          },
        },
      },
    }
    connection.send(message)
    return Result.ok()
  }
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
