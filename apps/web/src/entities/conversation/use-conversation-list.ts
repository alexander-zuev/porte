import { useInfiniteQuery } from '@tanstack/react-query'

import { useConversationAttention } from './conversation-attention-context.tsx'
import { conversationAttentionStatus, conversationTurnStatus } from './conversation-attention.ts'
import type { ConversationList } from './conversation-list.ts'
import { conversationQueries } from './conversation-queries.ts'

/** The read and its mapping, so a page never sees a query and a route only passes it down. */
export function useConversationList(): ConversationList {
  const query = useInfiniteQuery(conversationQueries.list())
  const { activeConversationIds, unseenConversationIds } = useConversationAttention()

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
