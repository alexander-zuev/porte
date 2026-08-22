import { useQuery } from '@tanstack/react-query'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useRelayReadyState } from '@web/entities/host/relay-context.tsx'

/**
 * Whether something sent now would arrive.
 *
 * Both halves have to hold: our socket carries the message, and the Mac is
 * there to receive it. Derived where it is asked, so it cannot disagree with
 * either fact it reads.
 */
export function useCanReachHost(): boolean {
  const status = useQuery(hostQueries.status())
  const readyState = useRelayReadyState()

  return status.data?.status === 'online' && readyState === WebSocket.OPEN
}
