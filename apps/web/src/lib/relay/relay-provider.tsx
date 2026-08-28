import type { HostRelayState } from '@porte/core/client'
import type { HostRelayAgent } from '@server/infrastructure/durable-objects/host-relay-agent.ts'
import { useQueryClient } from '@tanstack/react-query'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import { ProviderMissing } from '@web/lib/errors/provider-missing.ts'
import { useAgent } from 'agents/react'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

const RELAY_PATH = 'api/host/ws'

type HostAgentConnection = ReturnType<typeof useAgent<HostRelayAgent, HostRelayState>>

/** This browser's connection to the relay: the socket, and the last state the relay sent over it. */
export type RelayConnection = {
  /** WebSocket `readyState`: CONNECTING, OPEN, CLOSING, CLOSED. */
  readonly readyState: number
  /** Undefined until the relay's first state frame. */
  readonly state: HostRelayState | undefined
}

const RelayContext = createContext<RelayConnection | null>(null)

/**
 * Holds the browser's one socket to the account's `HostRelayAgent`.
 *
 * `useAgent` hands back one mutable socket object, so the context carries a
 * fresh `RelayConnection` value whenever `readyState` or the relay state
 * changes; that is what makes consumers re-render. Everything the relay says
 * arrives as typed state; conversation content has its own socket per
 * conversation.
 */
export function RelayProvider({ children }: { readonly children: ReactNode }) {
  const agent = useAgent<HostRelayAgent, HostRelayState>({
    agent: 'HostRelayAgent',
    basePath: RELAY_PATH,
  })
  const readyState = useReadyState(agent)
  // Read off the mutable socket here: `agent` itself never changes identity.
  const { state } = agent
  useConversationListRefresh(state?.conversationsVersion)
  const connection = useMemo<RelayConnection>(() => ({ readyState, state }), [readyState, state])
  return <RelayContext value={connection}>{children}</RelayContext>
}

/** Returns this browser's connection to the relay. */
export function useRelay(): RelayConnection {
  const relay = useContext(RelayContext)
  if (relay === null) throw new ProviderMissing('useRelay', 'RelayProvider')
  return relay
}

/** `readyState` is a field on the socket, not React state; `useAgent` does not re-render on `open`. */
function useReadyState(agent: HostAgentConnection): number {
  return useSyncExternalStore(
    (onChange) => {
      agent.addEventListener('open', onChange)
      agent.addEventListener('close', onChange)
      agent.addEventListener('error', onChange)
      return () => {
        agent.removeEventListener('open', onChange)
        agent.removeEventListener('close', onChange)
        agent.removeEventListener('error', onChange)
      }
    },
    () => agent.readyState,
    () => WebSocket.CONNECTING,
  )
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
