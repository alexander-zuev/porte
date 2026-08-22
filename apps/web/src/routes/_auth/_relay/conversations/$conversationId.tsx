import { ConversationIdSchema } from '@porte/core/client'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useConversation } from '@web/entities/conversation/use-conversation.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useCanReachHost } from '@web/lib/host/use-can-reach-host.ts'
import { useHostConnection } from '@web/lib/host/use-host-connection.ts'
import { createSeoHead } from '@web/lib/seo.ts'
import { ConversationPage } from '@web/pages/conversation/conversation-page.tsx'

export const Route = createFileRoute('/_auth/_relay/conversations/$conversationId')({
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
      path: '/conversations/$conversationId',
      noIndex: true,
    }),
  staticData: { appShell: 'fill' },
  component: ConversationRoute,
})

function ConversationRoute() {
  const { host } = Route.useRouteContext()
  const { conversationId } = Route.useParams()
  const connection = useHostConnection()
  const canSend = useCanReachHost()
  const view = useConversation(conversationId)

  return (
    <ConversationPage
      conversationId={conversationId}
      host={host}
      canSend={canSend}
      view={view}
      connection={connection}
    />
  )
}
