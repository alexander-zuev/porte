import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useRelay, useRelayReadyState } from '@web/entities/host/relay-context.tsx'
import { useEffect, useState } from 'react'

/** How long the reconnect control stays pending after one click. */
const RECONNECT_WINDOW_MS = 12_000

/** Returns the end-to-end connection and its reconnect action. */
export function useHostConnection(): HostConnection {
  const status = useQuery(hostQueries.status())
  const queryClient = useQueryClient()
  const relay = useRelay()
  const readyState = useRelayReadyState()
  const [reconnecting, setReconnecting] = useState(false)
  const connected = status.data?.status === 'online' && readyState === WebSocket.OPEN
  if (connected && reconnecting) setReconnecting(false)

  useEffect(() => {
    if (!reconnecting) return undefined
    const timeout = setTimeout(() => {
      setReconnecting(false)
    }, RECONNECT_WINDOW_MS)
    return () =>{  clearTimeout(timeout); }
  }, [reconnecting])

  if (status.data === undefined) return { status: 'loading' }

  if (connected) return { status: 'connected' }

  return {
    status: 'disconnected',
    reconnecting,
    reconnect: () => {
      if (readyState !== WebSocket.OPEN) relay.reconnect()
      setReconnecting(true)
      void queryClient.invalidateQueries({ queryKey: hostQueries.status().queryKey })
    },
  }
}
