import { useQueryClient } from '@tanstack/react-query'
import {
  hostConnectionNotice,
  type HostConnectionStatus,
} from '@web/entities/host/host-connection.ts'
import { hostQueryKeys } from '@web/entities/host/host-queries.ts'
import { useEffect, useRef } from 'react'

import {
  dismissHostNotice,
  notifyHostOffline,
  notifyHostOnline,
} from './host-connection-toasts.tsx'

/**
 * React when the machine leaves or returns while the page is open: a toast, and a
 * re-read of the host row, since the relay writes `lastSeenAt` on both moves.
 *
 * A socket that opens onto an online machine saw no move, but an offline toast
 * from the socket before it (a re-pair) may still be up. It goes.
 */
export function useHostConnectionNotice(status: HostConnectionStatus): void {
  const queryClient = useQueryClient()
  const previous = useRef<HostConnectionStatus>(status)
  useEffect(() => {
    const notice = hostConnectionNotice(previous.current, status)
    previous.current = status
    if (notice === undefined) {
      if (status === 'connected') dismissHostNotice()
      return
    }
    void queryClient.invalidateQueries({ queryKey: hostQueryKeys.all })
    if (notice === 'host-offline') notifyHostOffline()
    if (notice === 'host-online') notifyHostOnline()
  }, [queryClient, status])
}
