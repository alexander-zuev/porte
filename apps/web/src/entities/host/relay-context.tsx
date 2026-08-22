import { useQueryClient } from '@tanstack/react-query'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import { RelayConnection } from '@web/entities/host/relay-connection.ts'
import { INITIAL_RELAY_STATE, type RelayState } from '@web/entities/host/relay-state.ts'
import { RelayProviderMissing } from '@web/lib/errors/relay-error.ts'
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
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
  // Every one of these re-reads rather than writing the cache: a summary can
  // change its position in the order, so patching a row in place would leave it
  // sorted where it no longer belongs.
  const client = useMemo(
    () =>
      new RelayConnection({
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
    [queryClient],
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
 * What the browser currently knows about the Mac.
 *
 * The server render has no socket, so it answers with the state before one
 * exists. That is why `relay` starts as connecting rather than offline: a
 * healthy Mac must never flash "run porte up" while the line is opening.
 */
export function useRelay(): RelayState {
  const client = useContext(RelayContext)
  if (client === null) throw new RelayProviderMissing('useRelay')

  return useSyncExternalStore(client.subscribe, client.getState, serverState)
}

/** The client itself, for sending. Reading state goes through `useRelay`. */
export function useRelayConnection(): RelayConnection {
  const client = useContext(RelayContext)
  if (client === null) throw new RelayProviderMissing('useRelayConnection')

  return client
}

const serverState = (): RelayState => INITIAL_RELAY_STATE
