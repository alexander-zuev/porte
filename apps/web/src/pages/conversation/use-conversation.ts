import type { ConversationId, ConversationLiveState } from '@porte/core/client'
import { INITIAL_CONVERSATION_LIVE_STATE } from '@porte/core/client'
import { useSuspenseQuery } from '@tanstack/react-query'
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
  readonly state: ConversationLiveState
  readonly actions: ConversationActions
}

/**
 * One conversation screen: the stored transcript, the live socket, and what the person can do.
 *
 * Suspends until the transcript is read and throws when the read fails, so the
 * caller owns the pending and failed views through Suspense and an error boundary.
 */
export function useConversation(
  conversationId: ConversationId,
  messagesQuery: ConversationMessagesQuery,
): OpenConversation {
  const query = useSuspenseQuery(messagesQuery)
  const agent = useConversationAgent(conversationId)
  const { actions, answeringId } = useAnswerPermission(agent)
  // Until the first sync the Agent has reported nothing, which is what the initial state means.
  const state = agent.state ?? INITIAL_CONVERSATION_LIVE_STATE
  const permissions = useMemo<ConversationPermission[]>(
    () =>
      state.pending.permissions.map((permission) => ({
        permission,
        answering: permission.permissionId === answeringId,
      })),
    [answeringId, state],
  )

  return { agent, messages: query.data, permissions, state, actions }
}
