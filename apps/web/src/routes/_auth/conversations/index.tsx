import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Navigate, redirect } from '@tanstack/react-router'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useCreateConversation } from '@web/features/conversations/hooks/use-create-conversation.ts'
import { useHostConnection } from '@web/features/relay/use-host-connection.ts'
import { createSeoHead } from '@web/lib/seo.ts'
import { ConversationsPage } from '@web/pages/conversations/conversations-page.tsx'
import { useConversationList } from '@web/pages/conversations/use-conversation-list.ts'

export const Route = createFileRoute('/_auth/conversations/')({
  /** An unpaired account has nothing to see here, and `host` is known by now. */
  beforeLoad: async ({ context }) => {
    const owned = await context.queryClient.ensureQueryData(hostQueries.forAccount())
    if (owned.state !== 'paired') {
      // oxlint-disable-next-line typescript/only-throw-error -- Router redirects by throwing this.
      throw redirect({ to: '/pair' })
    }

    return { host: owned.host }
  },
  /** Prefetch, not ensure: a failed read is a body state, not a replaced route. */
  loader: async ({ context }) => {
    await context.queryClient.prefetchInfiniteQuery(conversationQueries.list())
  },
  head: () =>
    createSeoHead({
      title: 'Conversations | Porte',
      description: 'The Grok conversations on your paired machine, ready to pick up from anywhere.',
      path: '/conversations/',
      noIndex: true,
    }),
  component: ConversationsRoute,
})

function ConversationsRoute() {
  // The live row, not route context: the relay re-reads it on every connect and disconnect.
  const owned = useSuspenseQuery(hostQueries.forAccount()).data
  const connection = useHostConnection()
  const conversationList = useConversationList()
  const create = useCreateConversation()

  // Unpaired mid-visit (the account page): `beforeLoad` only guards the navigation.
  if (owned.state !== 'paired') return <Navigate to="/pair" />
  return (
    <ConversationsPage
      connection={connection}
      conversationList={conversationList}
      create={create}
      host={owned.host}
    />
  )
}
