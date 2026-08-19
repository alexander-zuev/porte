import { Toaster as Sonner } from 'sonner'

/** Toast host. Rendered once at the root so any surface can raise a message. */
export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      offset={24}
      gap={10}
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            'group toast flex w-full items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-lg',
          title: 'text-sm font-medium text-foreground',
          description: 'text-sm text-muted-foreground',
          icon: 'mt-px shrink-0',
          error: 'group-[.toaster]:text-destructive',
          success: 'group-[.toaster]:text-status-success-muted-foreground',
          closeButton: 'border-border bg-surface text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { toast } from 'sonner'
