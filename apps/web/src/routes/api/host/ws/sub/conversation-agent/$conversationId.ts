import { ConversationIdSchema, MalformedRequestError, NotAuthorizedError } from '@porte/core/client'
import { connectHost } from '@server/application/commands/connect-host.command.ts'
import { requireAuthRequest } from '@server/entrypoints/middleware/auth.middleware.ts'
import { routeErrorMiddleware } from '@server/entrypoints/middleware/error.middleware.ts'
import { requireWebSocketUpgrade } from '@server/entrypoints/middleware/websocket.middleware.ts'
import { createFileRoute } from '@tanstack/react-router'

/** Join a browser to one ConversationAgent. */
export const Route = createFileRoute('/api/host/ws/sub/conversation-agent/$conversationId')({
  server: {
    middleware: [routeErrorMiddleware, requireWebSocketUpgrade, requireAuthRequest],
    handlers: {
      GET: async ({ context, params, request }) => {
        const conversationId = ConversationIdSchema.safeParse(params.conversationId)
        if (!conversationId.success)
          throw new MalformedRequestError({ cause: conversationId.error })

        const connected = await connectHost(context.deps.hosts, context.deps.hostRelay, {
          userId: context.user.id,
          request,
          conversationId: conversationId.data,
        })
        if (connected.ok) return connected.response

        throw new NotAuthorizedError()
      },
    },
  },
})
