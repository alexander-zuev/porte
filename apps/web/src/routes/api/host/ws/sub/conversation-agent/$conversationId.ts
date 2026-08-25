import { ConversationIdSchema, MalformedRequestError } from '@porte/core/client'
import { routeErrorMiddleware } from '@server/entrypoints/middleware/error.middleware.ts'
import { requirePairedHostRequest } from '@server/entrypoints/middleware/paired-host.middleware.ts'
import { requireWebSocketUpgrade } from '@server/entrypoints/middleware/websocket.middleware.ts'
import { createFileRoute } from '@tanstack/react-router'

/** Join a daemon or browser to one ConversationAgent. */
export const Route = createFileRoute('/api/host/ws/sub/conversation-agent/$conversationId')({
  server: {
    middleware: [routeErrorMiddleware, requireWebSocketUpgrade, requirePairedHostRequest],
    handlers: {
      GET: async ({ context, params, request }) => {
        const conversationId = ConversationIdSchema.safeParse(params.conversationId)
        if (!conversationId.success)
          throw new MalformedRequestError({ cause: conversationId.error })

        return context.deps.conversationAgent.connect({
          hostId: context.hostId,
          role: context.role,
          conversationId: conversationId.data,
          request,
        })
      },
    },
  },
})
