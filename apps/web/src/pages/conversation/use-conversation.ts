import type { ConversationId, ConversationRelayState } from '@porte/core/client'
import { INITIAL_CONVERSATION_RELAY_STATE } from '@porte/core/client'
import { useQuery } from '@tanstack/react-query'
import type { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import {
  useAnswerPermission,
  type ConversationActions,
  type ConversationPermission,
} from '@web/features/conversation/hooks/use-answer-permission.ts'
import {
  useConversationAgent,
  type ConversationAgentConnection,
} from '@web/features/conversation/hooks/use-conversation-agent.ts'
import type { UIMessage } from 'ai'
import { useMemo } from 'react'

/** The bound read the route context carries, so the page observes what the loader started. */
export type ConversationMessagesQuery = ReturnType<typeof conversationQueries.messages>

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

/** One conversation screen: the stored transcript, the live socket, and what the person can do. */
export function useConversation(
  conversationId: ConversationId,
  messagesQuery: ConversationMessagesQuery,
): ConversationState {
  const query = useQuery(messagesQuery)
  const agent = useConversationAgent(conversationId)
  const { actions, answeringId } = useAnswerPermission(agent)
  // Until the first sync the Agent has reported nothing, which is what the initial state means.
  const state = agent.state ?? INITIAL_CONVERSATION_RELAY_STATE
  const permissions = useMemo<ConversationPermission[]>(
    () =>
      state.pending.permissions.map((permission) => ({
        permission,
        answering: permission.permissionId === answeringId,
      })),
    [answeringId, state],
  )

  if (query.status === 'pending') return { status: 'pending' }

  if (query.status === 'error') {
    return { status: 'failed', error: query.error, onRetry: () => void query.refetch() }
  }

  return { status: 'ready', agent, messages: query.data, permissions, state, actions }
}
