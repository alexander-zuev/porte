import { hostConnectionFrom, type HostConnection } from '@web/entities/host/host-connection.ts'
import { useRelay } from '@web/lib/relay/relay-provider.tsx'

/**
 * Both facts come from the one relay socket, which retries on its own and
 * re-sends the relay state on every open; nothing else is consulted.
 */
export function useHostConnection(): HostConnection {
  return hostConnectionFrom(useRelay())
}
