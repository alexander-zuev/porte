import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon } from '@phosphor-icons/react'
import { Toaster as Sonner } from 'sonner'

/** Toast host. Rendered once at the root so any surface can raise a message. */
export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      offset={24}
      gap={10}
      // Sonner ships solid glyphs. Every other icon in the product is Phosphor
      // at regular weight, and a toast is not the place to break that. The
      // shape carries the meaning: a cross failed, a triangle cautions.
      icons={{
        success: <CheckCircleIcon />,
        error: <XCircleIcon />,
        warning: <WarningIcon />,
        info: <InfoIcon />,
      }}
      toastOptions={{
        // Sonner paints a literal #000 through `--normal-bg`, from a rule with
        // two attribute selectors that outranks any single class. Dropping its
        // defaults is what the library documents instead of `!important`.
        unstyled: true,
        classNames: {
          // A toast floats over the page rather than sitting in it, so it takes
          // the popover step and the same hairline every other floating surface
          // carries. Sonner makes it focusable, so it draws its own ring too.
          toast:
            'group toast flex w-full items-start gap-3 rounded-lg bg-popover px-4 py-3 text-popover-foreground ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          title: 'text-sm font-medium text-foreground',
          description: 'text-sm text-muted-foreground',
          icon: 'mt-px size-4 shrink-0',
          content: 'flex min-w-0 flex-col gap-0.5',
          error: 'text-destructive-muted-foreground',
          success: 'text-status-success-muted-foreground',
          closeButton: 'rounded-md bg-popover text-muted-foreground ring-1 ring-foreground/10',
        },
      }}
      {...props}
    />
  )
}

export { toast } from 'sonner'
