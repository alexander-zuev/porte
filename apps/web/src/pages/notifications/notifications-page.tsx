import { BellIcon, XIcon } from '@phosphor-icons/react'
import type { PorteNotification } from '@web/features/notifications/models/notifications.ts'
import { EmptyState } from '@web/ui/components/empty-state.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'

export type NotificationsPageProps = {
  readonly notifications: readonly PorteNotification[]
  readonly actions: { readonly onDismiss: (id: string) => void }
}

/** Everything that needs the person, one card each; dismissed ones stay derivable but quiet. */
export function NotificationsPage({ notifications, actions }: NotificationsPageProps) {
  if (notifications.length === 0) {
    return (
      <EmptyState
        body="Updates and requests from your machine land here."
        icon={<BellIcon aria-hidden />}
        title="All caught up"
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-4">
      <h1>Notifications</h1>
      {notifications.map((notification) => (
        <article
          key={notification.id}
          className="flex items-start gap-3 rounded-2xl bg-surface p-4"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <h4>{notification.title}</h4>
            <p className="text-muted-foreground">{notification.body}</p>
          </div>
          <Button
            aria-label="Dismiss"
            className="ml-auto shrink-0 rounded-full"
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              actions.onDismiss(notification.id)
            }}
          >
            <XIcon aria-hidden />
          </Button>
        </article>
      ))}
    </div>
  )
}
