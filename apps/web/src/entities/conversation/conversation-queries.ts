import { LIST_CONVERSATIONS_LIMIT_DEFAULT, type ListConversationsResult } from '@porte/core/client'
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
  all: ['conversation'] as const,
  list: () =>
    infiniteQueryOptions({
      queryKey: ['conversation', 'list'] as const,
      queryFn: ({ pageParam }) =>
        getConversations({
          data:
            pageParam === undefined
              ? { limit: LIST_CONVERSATIONS_LIMIT_DEFAULT }
              : { cursor: pageParam, limit: LIST_CONVERSATIONS_LIMIT_DEFAULT },
        }),
      initialPageParam: undefined,
      getNextPageParam: (result: ListConversationsResult) => result.next,
    }),
}
