import {
  hostConnectionNotice,
  type HostConnectionStatus,
} from '@web/entities/host/host-connection.ts'
import { useEffect, useRef } from 'react'

import { notifyHostOffline, notifyHostOnline } from './host-connection-toasts.ts'

/** Raise a toast when the Mac leaves or returns while the page is open. */
export function useHostConnectionToasts(status: HostConnectionStatus): void {
  const previous = useRef<HostConnectionStatus>(status)
  useEffect(() => {
    const notice = hostConnectionNotice(previous.current, status)
    previous.current = status
    if (notice === 'host-offline') notifyHostOffline()
    if (notice === 'host-online') notifyHostOnline()
  }, [status])
}
