import { CONVERSATION_PAGE_SIZE, type ConversationPage } from '@porte/core/client'
import { getConversations } from '@server/entrypoints/functions/conversation.fn.ts'
import { infiniteQueryOptions } from '@tanstack/react-query'

/**
 * Query factory for the conversations on the account's Mac.
 *
 * Paged, because a Mac's history has no bound. The socket never carries the
 * list: it patches one summary or says the list moved, and this refetches.
 *
 * The server function returns the page or throws, so nothing is unwrapped here.
 * A failure reaches the route's `errorComponent`, which reads its tag.
 */
export const conversationQueries = {
  list: () =>
    infiniteQueryOptions({
      queryKey: ['conversation', 'list'] as const,
      queryFn: ({ pageParam }: { pageParam: string | null }) =>
        getConversations({ data: { cursor: pageParam, limit: CONVERSATION_PAGE_SIZE } }),
      initialPageParam: null,
      getNextPageParam: (page: ConversationPage) => page.next,
    }),
}
