import { ConversationIdSchema, NotAuthorizedError } from '@porte/core/client'
import { connectHost } from '@server/application/commands/connect-host.command.ts'
import { createFileRoute } from '@tanstack/react-router'

/** Join a browser to one ConversationAgent. */
export const Route = createFileRoute('/api/host/ws/sub/conversation-agent/$conversationId')({
  server: {
    handlers: {
      GET: async ({ context, params, request }) => {
        const conversationId = ConversationIdSchema.parse(params.conversationId)
        const connected = await connectHost(context.deps.hosts, context.deps.hostRelay, {
          userId: context.user.id,
          request,
          conversationId,
        })
        if (connected.ok) return connected.response

        throw new NotAuthorizedError()
      },
    },
  },
})
