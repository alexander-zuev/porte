import { HostIdSchema, type HostId } from '@porte/core'
import type { Connection } from 'agents'

import { RELAY_HOST_ID_HEADER } from './relay-headers.ts'

/**
 * True when the upgrade offered this WebSocket subprotocol.
 *
 * @param request - The inbound upgrade request.
 * @param expected - The subprotocol this socket must select.
 * @returns True when `Sec-WebSocket-Protocol` lists `expected`.
 */
export function hasSubprotocol(request: Request, expected: string): boolean {
  return (
    request.headers
      .get('sec-websocket-protocol')
      ?.split(',')
      .map((value) => value.trim())
      .includes(expected) === true
  )
}

/** Input that admits one Mac Host socket on a relay Agent. */
export type AdmitHostSocketInput = {
  /** The connecting socket. */
  readonly connection: Connection
  /** The upgrade that created it. */
  readonly request: Request
  /** Subprotocol this Agent accepts as Host. */
  readonly subprotocol: string
  /** Open Host sockets already tagged on this Agent. */
  readonly previous: Iterable<Connection>
  /** When set, the Host header must match this id. */
  readonly expectedHostId?: HostId
}

/**
 * Admit one Host socket, or close it.
 * Closes any previous Host socket on this Agent.
 *
 * @param input - Connection, upgrade, subprotocol, and optional Host id.
 * @returns True when this socket is now the Host connection.
 */
export function admitHostSocket(input: AdmitHostSocketInput): boolean {
  if (!hasSubprotocol(input.request, input.subprotocol)) return false
  const hostId = HostIdSchema.safeParse(input.request.headers.get(RELAY_HOST_ID_HEADER))
  if (
    !hostId.success ||
    (input.expectedHostId !== undefined && hostId.data !== input.expectedHostId)
  ) {
    input.connection.close(1008, 'invalid host connection')
    return false
  }
  for (const previous of input.previous) {
    if (previous.id !== input.connection.id) previous.close(1008, 'host connection replaced')
  }
  return true
}

/**
 * The first open connection in a tagged set, if any.
 *
 * @param connections - Tagged sockets from `getConnections`.
 * @returns The first `OPEN` connection, or undefined.
 */
export function openHostConnection(connections: Iterable<Connection>): Connection | undefined {
  for (const connection of connections) {
    if (connection.readyState === WebSocket.OPEN) return connection
  }
  return undefined
}
