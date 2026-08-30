import { CopyIcon } from '@phosphor-icons/react'
import { UP_COMMAND } from '@web/lib/product.ts'
import { toast } from '@web/ui/components/ui/sonner.tsx'

/** One id, so a flapping connection replaces the toast instead of stacking it. */
const HOST_TOAST_ID = 'host-connection'

/** The machine dropped off the relay while this page was open. */
export function notifyHostOffline(): void {
  toast.warning('Your machine went offline', {
    id: HOST_TOAST_ID,
    description: `Run ${UP_COMMAND} on the machine to reconnect.`,
    action: {
      // An icon: the word wraps inside a phone-width toast.
      label: (
        <>
          <CopyIcon aria-hidden />
          <span className="sr-only">Copy {UP_COMMAND}</span>
        </>
      ),
      onClick: () => {
        void navigator.clipboard.writeText(UP_COMMAND)
      },
    },
  })
}

/** The offline toast no longer describes the machine this page is on: unpaired, or a fresh socket that is online. */
export function dismissHostNotice(): void {
  toast.dismiss(HOST_TOAST_ID)
}

/** The machine is back after an offline toast. */
export function notifyHostOnline(): void {
  // Same id updates the offline toast in place, so its description and action must be cleared here.
  toast.success('Your machine is back online', {
    id: HOST_TOAST_ID,
    description: undefined,
    action: undefined,
    duration: 4000,
  })
}
