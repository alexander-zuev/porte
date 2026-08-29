import { UP_COMMAND } from '@web/lib/product.ts'
import { toast } from '@web/ui/components/ui/sonner.tsx'

/** One id, so a flapping connection replaces the toast instead of stacking it. */
const HOST_TOAST_ID = 'host-connection'

/** The Mac dropped off the relay while this page was open. */
export function notifyHostOffline(): void {
  toast.warning('Your Mac went offline', {
    id: HOST_TOAST_ID,
    description: `Run ${UP_COMMAND} on the Mac to reconnect.`,
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: 'Copy command',
      onClick: () => {
        void navigator.clipboard.writeText(UP_COMMAND)
      },
    },
  })
}

/** The Mac is back after an offline toast. */
export function notifyHostOnline(): void {
  toast.success('Your Mac is back online', { id: HOST_TOAST_ID, duration: 4000 })
}
