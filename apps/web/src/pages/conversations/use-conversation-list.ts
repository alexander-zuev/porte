import { useInfiniteQuery } from '@tanstack/react-query'
import {
  conversationAttentionStatus,
  conversationTurnStatus,
} from '@web/entities/conversation/conversation-attention.ts'
import type { ConversationList } from '@web/entities/conversation/conversation-list.ts'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import { useUnseenConversations } from '@web/features/conversations/hooks/unseen-conversations-context.tsx'
import { useRelay } from '@web/features/relay/relay-provider.tsx'
import { useMemo } from 'react'

/** The read and its mapping, so a page never sees a query and a route only passes it down. */
export function useConversationList(): ConversationList {
  const query = useInfiniteQuery(conversationQueries.list())
  const activeConversations = useRelay().state?.activeConversations
  const { unseenConversationIds } = useUnseenConversations()
  const activeConversationIds = useMemo(
    () => new Set(activeConversations?.map((conversation) => conversation.conversationId)),
    [activeConversations],
  )

  if (query.status === 'pending') return { status: 'pending' }

  if (query.status === 'error') {
    return { status: 'failed', error: query.error, onRetry: () => void query.refetch() }
  }

  return {
    status: 'ready',
    // Flattened: a page boundary is not something a person should be able to see.
    conversations: query.data.pages.flatMap((page) =>
      page.conversations.map((conversation) => ({
        conversation,
        turnStatus: conversationTurnStatus(conversation.id, activeConversationIds),
        attentionStatus: conversationAttentionStatus(conversation.id, unseenConversationIds),
      })),
    ),
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    onLoadMore: () => void query.fetchNextPage(),
  }
}
