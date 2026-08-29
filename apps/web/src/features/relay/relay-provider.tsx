import type { HostRelayState } from '@porte/core/client'
import type { HostRelayAgent } from '@server/infrastructure/durable-objects/host-relay-agent.ts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import { hostConnectionFrom, type RelayConnection } from '@web/entities/host/host-connection.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useHostConnectionNotice } from '@web/features/relay/use-host-connection-notice.ts'
import { ProviderMissing } from '@web/lib/errors/provider-missing.ts'
import { useAgent } from 'agents/react'
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'

const RELAY_PATH = 'api/host/ws'

const RelayContext = createContext<RelayConnection | null>(null)

/** Before the host row is known, or when the account owns no machine: no socket to speak of. */
const NO_SOCKET: RelayConnection = { identified: false, state: undefined }

/**
 * Holds the browser's one socket to the account's `HostRelayAgent`.
 *
 * The relay object is named by the host id, and a re-pair issues a new id, so
 * the socket is keyed on it: unpairing drops the socket instead of letting it
 * retry into 403s, and re-pairing opens one on the new object at once.
 */
export function RelayProvider({ children }: { readonly children: ReactNode }) {
  const owned = useQuery(hostQueries.forAccount())
  if (owned.data?.state !== 'paired') {
    return <RelayContext value={NO_SOCKET}>{children}</RelayContext>
  }
  return <RelaySocket key={owned.data.host.id}>{children}</RelaySocket>
}

/** Returns this browser's connection to the relay. */
export function useRelay(): RelayConnection {
  const relay = useContext(RelayContext)
  if (relay === null) throw new ProviderMissing('useRelay', 'RelayProvider')
  return relay
}

/** One socket for one pairing; the server resolves the relay object from the session. */
function RelaySocket({ children }: { readonly children: ReactNode }) {
  const agent = useAgent<HostRelayAgent, HostRelayState>({
    agent: 'HostRelayAgent',
    basePath: RELAY_PATH,
  })
  // Read off the mutable socket here: `agent` itself never changes identity.
  const { identified, state } = agent
  const connection = useMemo<RelayConnection>(() => ({ identified, state }), [identified, state])
  useConversationListRefresh(state?.conversationsVersion)
  useHostConnectionNotice(hostConnectionFrom(connection).status)
  return <RelayContext value={connection}>{children}</RelayContext>
}

/** Refetch the list when the relay's version moves past the first one seen; a re-sent version is free. */
function useConversationListRefresh(version: number | undefined): void {
  const queryClient = useQueryClient()
  const seen = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (version === undefined) return
    const previous = seen.current
    seen.current = version
    if (previous === undefined || previous === version) return
    void queryClient.invalidateQueries({ queryKey: conversationQueries.list().queryKey })
  }, [queryClient, version])
}
