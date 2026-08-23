import { cn } from '@web/lib/utils.ts'
import { PublicFooter } from '@web/ui/components/layout/public-footer.tsx'
import type { ReactNode } from 'react'

/**
 * `scroll` grows with its content and lets the document scroll, which is what
 * keeps a phone's URL bar hiding and pull-to-refresh working. `fill` bounds the
 * frame to the viewport so a scroll container inside main can own the overflow.
 * `card` is one thing to do, centred in what the bar and the footer leave.
 */
export type AppShellVariant = 'scroll' | 'fill' | 'card'

export type AppShellProps = {
  readonly variant: AppShellVariant
  readonly header?: ReactNode
  readonly children: ReactNode
}

/** The frame every signed-in page renders in. */
export function AppShell({ variant, header, children }: AppShellProps) {
  return (
    <div className={cn('shell-frame', variant === 'fill' && 'h-svh')}>
      {header}
      {/* Its own vertical rhythm rather than `shell-y`: that measure is for a
          marketing page opening on a headline, and the app opens on a list. */}
      <main
        className={cn(
          'shell-x flex min-h-0 flex-1 flex-col',
          // `card` centres one thing in the viewport, so it takes no column:
          // a reading measure would pin it to the left of all that space.
          variant === 'card' ? 'items-center justify-center gap-10 py-12' : 'container-column',
          variant === 'scroll' && 'py-4 md:py-6',
        )}
      >
        {children}
      </main>
      {/* Outside main, so the terms sit at the foot of the frame here exactly as
          they do on sign-in, rather than trailing the step. */}
      {variant === 'card' && <PublicFooter variant="legal" />}
    </div>
  )
}
