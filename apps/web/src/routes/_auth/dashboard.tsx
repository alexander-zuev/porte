import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { hostQueries } from '#/entities/host/host-queries.ts'
import { ConversationListFooter } from '#/features/dashboard/components/conversation-list-footer.tsx'
import { createSeoHead } from '#/lib/seo.ts'
import { DashboardPage } from '#/pages/dashboard/dashboard-page.tsx'

export const Route = createFileRoute('/_auth/dashboard')({
  loader: ({ context }) => context.queryClient.ensureQueryData(hostQueries.view()),
  head: () =>
    createSeoHead({
      title: 'Sessions | Porte',
      description: 'The Grok sessions running on your paired Mac, ready to pick up from anywhere.',
      path: '/dashboard',
      noIndex: true,
    }),
  component: DashboardRoute,
})

function DashboardRoute() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const view = useQuery(hostQueries.view())

  const goToPair = () => {
    void navigate({ to: '/pair' })
  }

  /** Session actions arrive with the session flows. */
  const actions = {
    onOpenConversation: () => undefined,
    onStartConversation: () => undefined,
    onPair: goToPair,
    onRetry: () => {
      void view.refetch()
    },
  }

  const footer = <ConversationListFooter user={user} />

  if (view.isPending) {
    return (
      <DashboardPage
        footer={footer}
        list={{ ...actions, state: 'loading', hostName: 'Your Mac' }}
        view="conversations"
      />
    )
  }

  if (view.isError) {
    return (
      <DashboardPage
        footer={footer}
        list={{ ...actions, state: 'error', hostName: 'Your Mac' }}
        view="conversations"
      />
    )
  }

  if (view.data.state === 'unpaired') {
    return <DashboardPage reason="unpaired" view="pair" onEnterCode={goToPair} />
  }

  if (view.data.state === 'revoked') {
    return (
      <DashboardPage
        hostName={view.data.host.name}
        reason="revoked"
        view="pair"
        onEnterCode={goToPair}
      />
    )
  }

  const { host, conversations, runningConversationIds } = view.data
  return (
    <DashboardPage
      footer={footer}
      view="conversations"
      list={{
        ...actions,
        state: 'ready',
        hostName: host.name,
        hostStatus: host.availability,
        lastSeen: host.availability === 'offline' ? host.lastSeenAt : undefined,
        conversations,
        runningConversationIds: new Set(runningConversationIds),
      }}
    />
  )
}
