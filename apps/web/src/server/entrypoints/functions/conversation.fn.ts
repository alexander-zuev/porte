import { ConversationPageQuerySchema, type ConversationPage } from '@porte/core/client'
import { getConversations as getConversationsQuery } from '@server/application/queries/get-conversations.query.ts'
import { requireAuth } from '@server/entrypoints/middleware/auth.middleware.ts'
import { createServerFn } from '@tanstack/react-start'

/**
 * Conversation entrypoints for the web client.
 *
 * The list only. Opening a conversation and everything inside one travel over
 * the relay socket, because they are live and this is not.
 */

/** Read one page of the conversations on the account's Mac. */
export const getConversations = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .validator(ConversationPageQuerySchema)
  .handler(async ({ context, data }): Promise<ConversationPage> => {
    return getConversationsQuery(context.deps.hosts, context.deps.hostRelay, context.user.id, data)
  })
