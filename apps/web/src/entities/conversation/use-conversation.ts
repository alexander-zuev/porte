import type { UseAgentChatOptions } from '@cloudflare/ai-chat/react'
import type { ConversationId, ConversationRelayState, PendingPermission } from '@porte/core/client'
import { INITIAL_CONVERSATION_RELAY_STATE } from '@porte/core/client'
import type { ConversationAgent } from '@server/infrastructure/durable-objects/conversation-agent.ts'
import { useQuery } from '@tanstack/react-query'
import { useAgent } from 'agents/react'
import type { UIMessage } from 'ai'
import { useMemo, useState } from 'react'

import type { conversationQueries } from './conversation-queries.ts'

/** The bound read the route context carries, so the page observes what the loader started. */
export type ConversationMessagesQuery = ReturnType<typeof conversationQueries.messages>

export type ConversationPermission = {
  readonly permission: PendingPermission
  readonly answering: boolean
}

type ConversationAgentClient = ReturnType<
  typeof useAgent<ConversationAgent, ConversationRelayState>
>

/** The ConversationAgent fields that the chat component uses. */
export type ConversationAgentConnection = UseAgentChatOptions<ConversationRelayState>['agent'] &
  Pick<ConversationAgentClient, 'OPEN' | 'readyState'>

/** Everything one open conversation renders from. */
export type OpenConversation = {
  readonly agent: ConversationAgentConnection
  readonly messages: UIMessage[]
  readonly permissions: readonly ConversationPermission[]
  readonly state: ConversationRelayState
  readonly actions: ConversationActions
}

/** The transcript read decides the arm; the socket is opened in every arm so it is ready when the read lands. */
export type ConversationState =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly error: unknown; readonly onRetry: () => void }
  | ({ readonly status: 'ready' } & OpenConversation)

/** User actions that change the active conversation. */
export type ConversationActions = {
  readonly onAnswerPermission: (waiting: ConversationPermission, optionId: string) => void
}

/** Connects one page directly to its ConversationAgent. */
export function useConversation(
  conversationId: ConversationId,
  messagesQuery: ConversationMessagesQuery,
): ConversationState {
  const query = useQuery(messagesQuery)
  const agent = useAgent<ConversationAgent, ConversationRelayState>({
    agent: 'HostRelayAgent',
    basePath: 'api/host/ws',
    sub: [{ agent: 'ConversationAgent', name: conversationId }],
  })
  const [answering, setAnswering] = useState<ReadonlySet<string>>(new Set())
  // Until the first sync the Agent has reported nothing, which is what the initial state means.
  const state = agent.state ?? INITIAL_CONVERSATION_RELAY_STATE
  const permissions = useMemo<ConversationPermission[]>(
    () =>
      state.pending.permissions.map((permission) => ({
        permission,
        answering: answering.has(permission.permissionId),
      })),
    [answering, state],
  )
  const actions = useMemo<ConversationActions>(
    () => ({
      onAnswerPermission: (waiting, optionId) => {
        setAnswering((current) => new Set(current).add(waiting.permission.permissionId))
        void agent.stub
          .answerPermission({
            turnId: waiting.permission.turnId,
            permissionId: waiting.permission.permissionId,
            optionId,
          })
          .catch(() => {
            setAnswering((current) => without(current, waiting.permission.permissionId))
          })
      },
    }),
    [agent.stub],
  )

  if (query.status === 'pending') return { status: 'pending' }

  if (query.status === 'error') {
    return { status: 'failed', error: query.error, onRetry: () => void query.refetch() }
  }

  return { status: 'ready', agent, messages: query.data, permissions, state, actions }
}

function without(values: ReadonlySet<string>, removed: string): ReadonlySet<string> {
  const next = new Set(values)
  next.delete(removed)
  return next
}
