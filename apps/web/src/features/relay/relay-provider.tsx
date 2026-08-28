import type { HostRelayState } from '@porte/core/client'
import type { HostRelayAgent } from '@server/infrastructure/durable-objects/host-relay-agent.ts'
import { useQueryClient } from '@tanstack/react-query'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import type { RelayConnection } from '@web/entities/host/host-connection.ts'
import { ProviderMissing } from '@web/lib/errors/provider-missing.ts'
import { useAgent } from 'agents/react'
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'

const RELAY_PATH = 'api/host/ws'

const RelayContext = createContext<RelayConnection | null>(null)

/**
 * Holds the browser's one socket to the account's `HostRelayAgent`.
 *
 * `useAgent` hands back one mutable socket object, so the context carries a
 * fresh `RelayConnection` value whenever `identified` or the relay state
 * changes; that is what makes consumers re-render. Everything the relay says
 * arrives as typed state; conversation content has its own socket per
 * conversation.
 */
export function RelayProvider({ children }: { readonly children: ReactNode }) {
  const agent = useAgent<HostRelayAgent, HostRelayState>({
    agent: 'HostRelayAgent',
    basePath: RELAY_PATH,
  })
  // Read off the mutable socket here: `agent` itself never changes identity.
  const { identified, state } = agent
  useConversationListRefresh(state?.conversationsVersion)
  const connection = useMemo<RelayConnection>(() => ({ identified, state }), [identified, state])
  return <RelayContext value={connection}>{children}</RelayContext>
}

/** Returns this browser's connection to the relay. */
export function useRelay(): RelayConnection {
  const relay = useContext(RelayContext)
  if (relay === null) throw new ProviderMissing('useRelay', 'RelayProvider')
  return relay
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
