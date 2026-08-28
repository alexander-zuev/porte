import { ConversationIdSchema } from '@porte/core/client'
import { noop } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
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
  /** Bound once from the URL; the loader and the page observe this same object. */
  context: ({ params }) => ({
    messagesQuery: conversationQueries.messages(params.conversationId),
  }),
  /** An unpaired account has no conversation to open. A cached answer is enough to decide. */
  beforeLoad: async ({ context }) => {
    const owned = await context.queryClient.query({
      ...hostQueries.forAccount(),
      staleTime: 'static',
    })
    if (owned.state !== 'paired') {
      // oxlint-disable-next-line typescript/only-throw-error -- Router redirects by throwing this.
      throw redirect({ to: '/pair' })
    }

    return { host: owned.host }
  },
  /** Started here, not awaited: the page owns pending and failed, and renders at once. */
  loader: ({ context }) => {
    void context.queryClient.query(context.messagesQuery).catch(noop)
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
  const { host, messagesQuery } = Route.useRouteContext()
  const connection = useHostConnection()
  const conversation = useConversation(conversationId, messagesQuery)
  useVisibleConversation(conversationId)

  return <ConversationPage connection={connection} conversation={conversation} host={host} />
}
