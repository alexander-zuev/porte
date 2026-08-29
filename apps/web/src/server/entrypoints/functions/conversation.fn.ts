import {
  ConversationIdSchema,
  ListConversationsParamsSchema,
  type ConversationSummary,
  type ListConversationsResult,
} from '@porte/core/client'
import { createConversation as createConversationCommand } from '@server/application/commands/create-conversation.command.ts'
import { getConversationMessages as getConversationMessagesQuery } from '@server/application/queries/get-conversation-messages.query.ts'
import { getConversations as getConversationsQuery } from '@server/application/queries/get-conversations.query.ts'
import { requireAuth } from '@server/entrypoints/middleware/auth.middleware.ts'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

/**
 * Conversation entrypoints for the web client.
 *
 * HTTP owns conversation lists and the first message snapshot. ConversationAgent
 * owns every later change, over its socket.
 */

/** Read one page of the conversations on the account's machine. */
export const getConversations = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .validator(ListConversationsParamsSchema)
  .handler(async ({ context, data }): Promise<ListConversationsResult> => {
    return getConversationsQuery(context.deps.hosts, context.deps.hostRelay, context.user.id, data)
  })

/** Start a conversation in one folder on the machine and answer with its summary. */
export const createConversation = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ cwd: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<ConversationSummary> => {
    return createConversationCommand(
      context.deps.hosts,
      context.deps.hostRelay,
      context.user.id,
      data.cwd,
    )
  })

/**
 * Read one conversation's stored messages, so the page renders before its socket opens.
 * The Agent's response is passed through: its `UIMessage` type carries `unknown` fields
 * that Start will not type-check, and the client names the payload once.
 */
export const getConversationMessages = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .validator(z.object({ conversationId: ConversationIdSchema }))
  .handler(async ({ context, data }): Promise<Response> => {
    return getConversationMessagesQuery(
      context.deps.hosts,
      context.deps.conversationAgent,
      context.user.id,
      data.conversationId,
      getRequest(),
    )
  })
