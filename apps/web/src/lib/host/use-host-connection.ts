import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useRelay, useRelayReadyState } from '@web/entities/host/relay-context.tsx'
import { useEffect, useState } from 'react'

/** How often to read the host status after a reconnect request. */
const RECONNECT_POLL_MS = 2000

/** How long one reconnect request reads the host status. */
const RECONNECT_WINDOW_MS = 12_000

/** Returns the end-to-end connection and its reconnect action. */
export function useHostConnection(): HostConnection {
  const status = useQuery(hostQueries.status())
  const queryClient = useQueryClient()
  const relay = useRelay()
  const readyState = useRelayReadyState()
  const [reconnecting, setReconnecting] = useState(false)

  useEffect(() => {
    if (!reconnecting) return undefined

    const poll = () => {
      void queryClient.refetchQueries({ queryKey: hostQueries.status().queryKey })
    }

    poll()
    const interval = setInterval(poll, RECONNECT_POLL_MS)
    const timeout = setTimeout(() => {
      setReconnecting(false)
    }, RECONNECT_WINDOW_MS)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [queryClient, reconnecting])

  if (status.data === undefined) return { status: 'loading' }

  if (status.data.status === 'online' && readyState === WebSocket.OPEN) {
    return { status: 'connected' }
  }

  return {
    status: 'disconnected',
    reconnecting,
    reconnect: () => {
      if (readyState !== WebSocket.OPEN) relay.reconnect()
      setReconnecting(true)
    },
  }
}
