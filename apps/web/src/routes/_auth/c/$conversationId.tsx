import { ConversationIdSchema } from '@porte/core/client'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useConversation } from '@web/entities/conversation/use-conversation.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useRelay } from '@web/entities/host/relay-context.tsx'
import { createSeoHead } from '@web/lib/seo.ts'
import { ConversationPage } from '@web/pages/conversation/conversation-page.tsx'

export const Route = createFileRoute('/_auth/c/$conversationId')({
  params: {
    parse: (raw) => ({ conversationId: ConversationIdSchema.parse(raw.conversationId) }),
    stringify: (params) => ({ conversationId: params.conversationId }),
  },
  /** An unpaired account has no conversation to open, and `host` is known by now. */
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
      path: '/c/$conversationId',
      noIndex: true,
    }),
  component: ConversationRoute,
})

function ConversationRoute() {
  const { host } = Route.useRouteContext()
  const { conversationId } = Route.useParams()
  const relay = useRelay()
  const view = useConversation(conversationId)

  return <ConversationPage conversationId={conversationId} host={host} relay={relay} view={view} />
}
