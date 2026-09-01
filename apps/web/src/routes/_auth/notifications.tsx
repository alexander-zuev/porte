import { createFileRoute } from '@tanstack/react-router'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useNotifications } from '@web/features/notifications/hooks/use-notifications.ts'
import { createSeoHead } from '@web/lib/seo.ts'
import { NotificationsPage } from '@web/pages/notifications/notifications-page.tsx'

export const Route = createFileRoute('/_auth/notifications')({
  loader: ({ context }) => context.queryClient.ensureQueryData(hostQueries.forAccount()),
  head: () =>
    createSeoHead({
      title: 'Notifications | Porte',
      description: 'Everything that needs you.',
      path: '/notifications',
      noIndex: true,
    }),
  component: NotificationsRoute,
})

function NotificationsRoute() {
  const { notifications, dismiss } = useNotifications()
  return <NotificationsPage actions={{ onDismiss: dismiss }} notifications={notifications} />
}
