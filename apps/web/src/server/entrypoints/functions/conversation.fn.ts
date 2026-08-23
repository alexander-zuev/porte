import {
  ConversationPageQuerySchema,
  ReadConversationSchema,
  type ConversationPage,
  type ConversationTranscript,
} from '@porte/core/client'
import { getConversation as getConversationQuery } from '@server/application/queries/get-conversation.query.ts'
import { getConversations as getConversationsQuery } from '@server/application/queries/get-conversations.query.ts'
import { requireAuth } from '@server/entrypoints/middleware/auth.middleware.ts'
import { createServerFn } from '@tanstack/react-start'

/**
 * Conversation entrypoints for the web client.
 *
 * HTTP owns conversation lists and transcript pages. Agent sockets own live state.
 */

/** Read one page of the conversations on the account's Mac. */
export const getConversations = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .validator(ConversationPageQuerySchema)
  .handler(async ({ context, data }): Promise<ConversationPage> => {
    return getConversationsQuery(context.deps.hosts, context.deps.hostRelay, context.user.id, data)
  })

/** Reads one canonical transcript page. */
export const getConversation = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .validator(ReadConversationSchema)
  .handler(async ({ context, data }): Promise<ConversationTranscript> => {
    const result = await getConversationQuery(
      context.deps.hosts,
      context.deps.hostRelay,
      context.user.id,
      data,
    )
    // oxlint-disable-next-line typescript/only-throw-error -- The client rejects with this and reads its tag.
    if (result.isErr()) throw result.error
    return result.value
  })
