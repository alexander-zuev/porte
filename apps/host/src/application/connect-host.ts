import type { IsoDateTime, SessionSummary } from '@porte/core'
import { Result, type Result as ResultType } from 'better-result'

import type { HostRelayError, SessionStoreError } from '../errors.ts'
import type { HostEventPublisher, HostRelay } from './ports/host-relay.ts'

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
        onConnected: async (publisher) => this.publishCatalog(publisher),
      },
    })
  }

  private async publishCatalog(
    publisher: HostEventPublisher,
  ): Promise<ResultType<void, SessionStoreError>> {
    const sessions = await this.sessions.list()
    if (sessions.isErr()) return Result.err(sessions.error)

    publisher.sessionsChanged({
      state: 'synced',
      sessions: sessions.value,
      observedAt: this.clock.now(),
    })
    return Result.ok()
  }
}
