import { ListConversationsParamsSchema, type ListConversationsResult } from '@porte/core/client'
import { getConversations as getConversationsQuery } from '@server/application/queries/get-conversations.query.ts'
import { requireAuth } from '@server/entrypoints/middleware/auth.middleware.ts'
import { createServerFn } from '@tanstack/react-start'

/**
 * Conversation entrypoints for the web client.
 *
 * HTTP owns conversation lists. ConversationAgent owns conversation data.
 */

/** Read one page of the conversations on the account's Mac. */
export const getConversations = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .validator(ListConversationsParamsSchema)
  .handler(async ({ context, data }): Promise<ListConversationsResult> => {
    return getConversationsQuery(context.deps.hosts, context.deps.hostRelay, context.user.id, data)
  })
