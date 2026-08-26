import { ConversationIdSchema, MalformedRequestError } from '@porte/core/client'
import { routeErrorMiddleware } from '@server/entrypoints/middleware/error.middleware.ts'
import { requirePairedHostRequest } from '@server/entrypoints/middleware/paired-host.middleware.ts'
import { createFileRoute } from '@tanstack/react-router'

/**
 * Read one conversation's stored messages.
 *
 * The chat client asks for this snapshot over HTTP before its socket has said
 * anything, and every later change arrives on the socket instead. Its sibling
 * connect routes are `index` files on purpose: a route file above this path
 * would add its upgrade requirement to this one.
 */
export const Route = createFileRoute(
  '/api/host/ws/sub/conversation-agent/$conversationId/get-messages',
)({
  server: {
    middleware: [routeErrorMiddleware, requirePairedHostRequest],
    handlers: {
      GET: async ({ context, params, request }) => {
        const conversationId = ConversationIdSchema.safeParse(params.conversationId)
        if (!conversationId.success)
          throw new MalformedRequestError({ cause: conversationId.error })

        return context.deps.conversationAgent.readMessages({
          hostId: context.hostId,
          role: context.role,
          conversationId: conversationId.data,
          request,
        })
      },
    },
  },
})
