import { createConversation } from '@server/entrypoints/functions/conversation.fn.ts'

import { conversationQueries } from './conversation-queries.ts'

/** Mutation factory for conversations. Invalidation belongs to the caller: it knows what it changed. */
export const conversationMutations = {
  create: () => ({
    mutationKey: [...conversationQueries.list().queryKey, 'create'] as const,
    mutationFn: (input: { readonly cwd: string }) => createConversation({ data: input }),
  }),
}
