import type { HostRelayState, HostStatus } from '@porte/core/client'
import type { HostRelayAgent } from '@server/infrastructure/durable-objects/host-relay-agent.ts'
import { useQueryClient } from '@tanstack/react-query'
import { ConversationAttentionProvider } from '@web/entities/conversation/conversation-attention-context.tsx'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { RelayProviderMissing } from '@web/lib/errors/relay-error.ts'
import { useAgentHeartbeat } from '@web/lib/host/use-agent-heartbeat.ts'
import { useAgent } from 'agents/react'
import { createContext, useContext, useRef, type ReactNode } from 'react'

const RELAY_PATH = 'api/host/ws'

type HostAgentConnection = ReturnType<typeof useAgent<HostRelayAgent, HostRelayState>>

const RelayContext = createContext<HostAgentConnection | null>(null)

/** Holds one Cloudflare Agent connection for the signed-in route tree. */
export function RelayProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient()
  const catalogRevision = useRef<number | undefined>(undefined)
  const agent = useAgent<HostRelayAgent, HostRelayState>({
    agent: 'HostRelayAgent',
    basePath: RELAY_PATH,
    onStateUpdate: (state) => {
      queryClient.setQueryData(hostQueries.status().queryKey, {
        status: state.hostStatus,
      } satisfies HostStatus)
      if (
        catalogRevision.current !== undefined &&
        catalogRevision.current !== state.catalogRevision
      ) {
        void queryClient.invalidateQueries({ queryKey: conversationQueries.list().queryKey })
      }
      catalogRevision.current = state.catalogRevision
    },
  })
  useAgentHeartbeat(agent)

  return (
    <RelayContext value={agent}>
      <ConversationAttentionProvider activeConversations={agent.state?.activeConversations ?? null}>
        {children}
      </ConversationAttentionProvider>
    </RelayContext>
  )
}

/** Returns the parent Agent connection for host state and reconnect control. */
export function useRelay(): HostAgentConnection {
  const agent = useContext(RelayContext)
  if (agent === null) throw new RelayProviderMissing('useRelay')
  return agent
}

/** Returns the browser connection state for the parent Agent. */
export function useRelayReadyState(): number {
  return useRelay().readyState
}
