import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { useRelay } from '@web/entities/host/relay-context.tsx'

/**
 * Socket first, then the Mac. Both facts come from the one relay socket, which
 * retries on its own and re-sends the relay state on every open.
 */
export function useHostConnection(): HostConnection {
  const relay = useRelay()
  if (relay.state === undefined) return { status: 'loading' }
  if (relay.readyState !== WebSocket.OPEN) return { status: 'connecting' }
  return relay.state.hostStatus === 'online' ? { status: 'connected' } : { status: 'offline' }
}
