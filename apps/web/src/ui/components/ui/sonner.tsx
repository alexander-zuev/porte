import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon } from '@phosphor-icons/react'
import { cn } from '@web/lib/utils.ts'
import { buttonVariants } from '@web/ui/components/ui/button.tsx'
import { usePhone } from '@web/ui/hooks/use-phone.ts'
import { Toaster as Sonner } from 'sonner'

/** Toast host. Rendered once at the root so any surface can raise a message. */
export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  // A phone's thumb and composer own the bottom edge, so toasts arrive from the top.
  const phone = usePhone()
  return (
    <Sonner
      // Below 600px Sonner keeps the host at `width: 100%` beside a left
      // offset, so the host box runs past the viewport. Size it to the offsets.
      className="toaster group max-[600px]:w-[calc(100%-var(--mobile-offset-left)-var(--mobile-offset-right))]!"
      position={phone ? 'top-center' : 'bottom-right'}
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
            'group toast flex w-full items-start gap-3 rounded-lg bg-popover px-4 py-3 text-popover-foreground ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-[600px]:w-full!',
          title: 'text-sm font-medium text-foreground',
          description: 'text-sm text-muted-foreground',
          icon: 'size-4 shrink-0 self-center',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          // Unstyled drops Sonner's button too, so the action takes the product's
          // outline button, centred on the toast and never wrapping.
          actionButton: cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'ml-auto shrink-0 self-center',
          ),
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
