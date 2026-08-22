import type { HostStatus } from '@porte/core/client'
import { useQueryClient } from '@tanstack/react-query'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { RelayConnection } from '@web/entities/host/relay-connection.ts'
import { RelayProviderMissing } from '@web/lib/errors/relay-error.ts'
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

const RelayContext = createContext<RelayConnection | null>(null)

/**
 * One line to the Mac, for as long as the person is signed in.
 *
 * Held here rather than in the page, because two components asking for a
 * connection would open two sockets and the relay would count two browsers
 * where there is one.
 */
export function RelayProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient()
  // `useState`, not `useMemo`: React may discard a memo and recompute it, and a
  // second connection here is a second socket.
  const [client] = useState(
    () =>
      new RelayConnection({
        // Written, not invalidated. The frame already carries the answer, so a
        // refetch would spend a round trip to learn what we were just told.
        onHostStatus: (status) => {
          queryClient.setQueryData(hostQueries.status().queryKey, { status } satisfies HostStatus)
        },
        // These three re-read instead: a summary can change its position in the
        // order, so patching one row would leave it sorted where it no longer
        // belongs.
        onConversationsInvalidated: () => {
          void queryClient.invalidateQueries({ queryKey: conversationQueries.list().queryKey })
        },
        onConversationChanged: () => {
          void queryClient.invalidateQueries({ queryKey: conversationQueries.list().queryKey })
        },
        onConversationRemoved: () => {
          void queryClient.invalidateQueries({ queryKey: conversationQueries.list().queryKey })
        },
      }),
  )

  useEffect(() => {
    client.connect()
    return () => {
      client.close()
    }
  }, [client])

  return <RelayContext value={client}>{children}</RelayContext>
}

/**
 * This browser's socket to the relay, as its own `readyState`. Nothing about the Mac.
 *
 * The server render has no socket, so it answers `CLOSED`. Whether the Mac is
 * there is a separate read, which is why a healthy Mac no longer waits on this.
 */
export function useRelayReadyState(): number {
  const client = useContext(RelayContext)
  if (client === null) throw new RelayProviderMissing('useRelayReadyState')

  return useSyncExternalStore(client.subscribe, client.getState, serverReadyState)
}

/** The relay client itself, for sending. Reading the line goes through `useRelayReadyState`. */
export function useRelay(): RelayConnection {
  const client = useContext(RelayContext)
  if (client === null) throw new RelayProviderMissing('useRelay')

  return client
}

const serverReadyState = (): number => WebSocket.CLOSED
