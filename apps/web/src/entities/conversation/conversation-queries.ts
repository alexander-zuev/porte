import type { ConversationSummary } from '@porte/core'
import { queryOptions } from '@tanstack/react-query'

export const conversationQueries = {
  catalog: () =>
    queryOptions({
      queryKey: ['conversation', 'catalog'] as const,
      queryFn: async (): Promise<readonly ConversationSummary[]> => [],
    }),
}
