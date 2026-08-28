import { JsonRpcNotificationSchema, createLogger, type HostRelayState } from '@porte/core/client'
import type { HostRelayAgent } from '@server/infrastructure/durable-objects/host-relay-agent.ts'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ConversationAttentionProvider } from '@web/entities/conversation/conversation-attention-context.tsx'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import { RelayProviderMissing } from '@web/lib/errors/relay-error.ts'
import { useAgent } from 'agents/react'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'

const logger = createLogger('relay-context')
const RELAY_PATH = 'api/host/ws'

const BROWSER_NOTIFICATION_HANDLERS = {
  'conversations.changed': (queryClient: QueryClient) => {
    void queryClient.invalidateQueries({ queryKey: conversationQueries.list().queryKey })
  },
} as const

type HostAgentConnection = ReturnType<typeof useAgent<HostRelayAgent, HostRelayState>>

/** The two facts the relay socket knows, as a value that changes when they do. */
export type Relay = {
  readonly agent: HostAgentConnection
  /** WebSocket `readyState`: CONNECTING, OPEN, CLOSING, CLOSED. */
  readonly readyState: number
  /** Undefined until the relay's first state frame. */
  readonly state: HostRelayState | undefined
}

const RelayContext = createContext<Relay | null>(null)

/**
 * Holds one Cloudflare Agent connection for the signed-in route tree.
 *
 * `useAgent` hands back one mutable socket object, so the context carries a
 * fresh `Relay` value whenever `readyState` or the relay state changes; that is
 * what makes consumers re-render. The conversation list stays an HTTP query;
 * the socket only says when to refetch it.
 */
export function RelayProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient()
  const agent = useAgent<HostRelayAgent, HostRelayState>({
    agent: 'HostRelayAgent',
    basePath: RELAY_PATH,
    // A reconnect may have missed `conversations.changed`; the list is cheap to read again.
    onOpen: () => {
      void queryClient.invalidateQueries({ queryKey: conversationQueries.list().queryKey })
    },
    onMessage: (message) => {
      const frame = z.string().safeParse(message.data)
      if (!frame.success) return
      handleBrowserNotification(frame.data, queryClient)
    },
  })
  const readyState = useReadyState(agent)
  // Read off the mutable socket here: `agent` itself never changes identity.
  const { state } = agent
  const relay = useMemo<Relay>(() => ({ agent, readyState, state }), [agent, readyState, state])
  return (
    <RelayContext value={relay}>
      <ConversationAttentionProvider activeConversations={relay.state?.activeConversations ?? null}>
        {children}
      </ConversationAttentionProvider>
    </RelayContext>
  )
}

/** Returns the relay socket facts and the connection for reconnect control. */
export function useRelay(): Relay {
  const relay = useContext(RelayContext)
  if (relay === null) throw new RelayProviderMissing('useRelay')
  return relay
}

/** The socket reports lifecycle as events, not renders; mirror `readyState` into React. */
function useReadyState(agent: HostAgentConnection): number {
  const [readyState, setReadyState] = useState(() => agent.readyState)
  useEffect(() => {
    const update = () => {
      setReadyState(agent.readyState)
    }
    update()
    agent.addEventListener('open', update)
    agent.addEventListener('close', update)
    agent.addEventListener('error', update)
    return () => {
      agent.removeEventListener('open', update)
      agent.removeEventListener('close', update)
      agent.removeEventListener('error', update)
    }
  }, [agent])
  return readyState
}

function handleBrowserNotification(frame: string, queryClient: QueryClient): void {
  let document: unknown
  try {
    document = JSON.parse(frame)
  } catch {
    return
  }
  const notification = JsonRpcNotificationSchema.safeParse(document)
  if (!notification.success) return
  const method = notification.data.method
  if (method === 'conversations.changed') {
    BROWSER_NOTIFICATION_HANDLERS[method](queryClient)
    return
  }
  logger.warn('unhandled_browser_notification', { details: { method } })
}
