import { BellIcon, XIcon } from '@phosphor-icons/react'
import type { PorteNotification } from '@web/features/notifications/models/notifications.ts'
import { EmptyState } from '@web/ui/components/empty-state.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { useReducedMotion } from '@web/ui/hooks/use-reduced-motion.ts'
import { AnimatePresence, motion } from 'motion/react'

export type NotificationsPageProps = {
  readonly notifications: readonly PorteNotification[]
  readonly actions: { readonly onDismiss: (id: string) => void }
}

/** Cards for everything that still needs the person; a dismissed card slides away. */
export function NotificationsPage({ notifications, actions }: NotificationsPageProps) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-4">
      <h1>Notifications</h1>
      <AnimatePresence initial={false}>
        {notifications.map((notification) => (
          <motion.article
            key={notification.id}
            layout
            className="flex items-start gap-3 rounded-2xl bg-surface p-4"
            exit={{ opacity: 0, x: reduceMotion ? 0 : 48 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
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
          </motion.article>
        ))}
      </AnimatePresence>
      {notifications.length === 0 && (
        <motion.div
          animate={{ opacity: 1 }}
          initial={{ opacity: 0 }}
          transition={{ delay: 0.15, duration: 0.2 }}
        >
          <EmptyState
            body="Updates and requests from your machine land here."
            icon={<BellIcon aria-hidden />}
            title="All caught up"
          />
        </motion.div>
      )}
    </div>
  )
}
