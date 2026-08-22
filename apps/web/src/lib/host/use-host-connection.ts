import { useQuery } from '@tanstack/react-query'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'

/**
 * Whether the Mac is reachable.
 *
 * Read over HTTP so a first paint is right, then kept current by the socket
 * writing this key. Nothing polls, and nothing waits on a socket to say
 * something a page already knows.
 */
export function useHostConnection(): HostConnection {
  const status = useQuery(hostQueries.status())
  if (status.data === undefined) return 'loading'

  return status.data.status
}
