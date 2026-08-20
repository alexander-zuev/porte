import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useRelay } from '@web/entities/host/relay-context.tsx'
import { ConversationListFooter } from '@web/features/conversations/components/conversation-list-footer.tsx'
import { ConversationsHeader } from '@web/features/conversations/components/conversations-header.tsx'
import { createSeoHead } from '@web/lib/seo.ts'
import { ConversationsPage } from '@web/pages/conversations/conversations-page.tsx'

export const Route = createFileRoute('/_auth/conversations')({
  /**
   * Pairing decides whether this route has anything to say, and it is known
   * before the page renders. Sending an unpaired account away here is what
   * keeps one route from having to describe two situations.
   */
  beforeLoad: async ({ context }) => {
    const owned = await context.queryClient.ensureQueryData(hostQueries.forAccount())
    if (owned.state !== 'paired') {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router performs redirects by throwing this value.
      throw redirect({ to: '/pair' })
    }

    // Handed down rather than read again below, so the component receives a Mac
    // that exists instead of one it has to check for.
    return { host: owned.host }
  },
  head: () =>
    createSeoHead({
      title: 'Conversations | Porte',
      description: 'The Grok conversations on your paired Mac, ready to pick up from anywhere.',
      path: '/conversations',
      noIndex: true,
    }),
  component: ConversationsRoute,
})

function ConversationsRoute() {
  const { user, host } = Route.useRouteContext()
  const navigate = useNavigate()
  const relay = useRelay()

  return (
    <ConversationsPage
      footer={<ConversationListFooter user={user} />}
      relay={relay}
      header={
        <ConversationsHeader host={host} relay={relay} onStartConversation={() => undefined} />
      }
      onOpenConversation={(conversationId) => {
        void navigate({ to: '/c/$conversationId', params: { conversationId } })
      }}
      onStartConversation={() => undefined}
    />
  )
}
