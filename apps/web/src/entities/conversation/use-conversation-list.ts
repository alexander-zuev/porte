import { useInfiniteQuery } from '@tanstack/react-query'
import { useRelay } from '@web/lib/relay/relay-provider.tsx'
import { useMemo } from 'react'

import { conversationAttentionStatus, conversationTurnStatus } from './conversation-attention.ts'
import type { ConversationList } from './conversation-list.ts'
import { conversationQueries } from './conversation-queries.ts'
import { useUnseenConversations } from './unseen-conversations-context.tsx'

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
