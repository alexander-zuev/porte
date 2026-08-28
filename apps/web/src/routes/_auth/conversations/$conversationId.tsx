import { ConversationIdSchema } from '@porte/core/client'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useVisibleConversation } from '@web/entities/conversation/unseen-conversations-context.tsx'
import { useConversation } from '@web/entities/conversation/use-conversation.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useHostConnection } from '@web/lib/host/use-host-connection.ts'
import { createSeoHead } from '@web/lib/seo.ts'
import { ConversationPage } from '@web/pages/conversation/conversation-page.tsx'

export const Route = createFileRoute('/_auth/conversations/$conversationId')({
  params: {
    parse: ({ conversationId }) => {
      const parsed = ConversationIdSchema.safeParse(conversationId)
      return parsed.success ? { conversationId: parsed.data } : false
    },
  },
  /** An unpaired account has no conversation to open. */
  beforeLoad: async ({ context }) => {
    const owned = await context.queryClient.ensureQueryData(hostQueries.forAccount())
    if (owned.state !== 'paired') {
      // oxlint-disable-next-line typescript/only-throw-error -- Router redirects by throwing this.
      throw redirect({ to: '/pair' })
    }

    return { host: owned.host }
  },
  head: () =>
    createSeoHead({
      title: 'Conversation | Porte',
      description: 'One Grok conversation on your paired Mac.',
      path: '/conversations/$conversationId',
      noIndex: true,
    }),
  staticData: { appShell: 'fill' },
  component: ConversationRoute,
})

function ConversationRoute() {
  const { conversationId } = Route.useParams()
  const connection = useHostConnection()
  const conversation = useConversation(conversationId)
  useVisibleConversation(conversationId)

  return <ConversationPage connection={connection} conversation={conversation} />
}
