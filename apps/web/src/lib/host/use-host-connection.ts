import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { useRelay, useRelayConnection } from '@web/entities/host/relay-context.tsx'

/**
 * Collapse the line and the Mac into the one thing a header shows.
 *
 * Our own line is read first: while it is down or given up, what we hold about
 * the Mac is only the last thing we heard, and reporting that as current would
 * send someone to a desk for nothing.
 */
export function useHostConnection(): HostConnection {
  const relay = useRelay()
  const relayConnection = useRelayConnection()

  if (relay.line === 'lost') {
    return {
      status: 'lost',
      onRetry: () => {
        relayConnection.reconnect()
      },
    }
  }
  if (relay.line === 'reconnecting') return { status: 'reconnecting' }
  // Covers both having no line and having one that has not carried the Mac's
  // status yet. The relay sends that first, so the second is a moment long.
  if (relay.mac === null) return { status: 'connecting' }

  return { status: relay.mac.online ? 'online' : 'offline' }
}
