import { cn } from '@web/lib/utils.ts'
import type { ReactNode } from 'react'

/**
 * `scroll` grows with its content and lets the document scroll, which is what
 * keeps a phone's URL bar hiding and pull-to-refresh working. `fill` bounds the
 * frame to the viewport so a scroll container inside main can own the overflow.
 */
export type AppShellVariant = 'scroll' | 'fill'

export type AppShellProps = {
  readonly variant: AppShellVariant
  readonly header?: ReactNode
  readonly footer?: ReactNode
  readonly children: ReactNode
}

/** The frame every signed-in page renders in. */
export function AppShell({ variant, header, footer, children }: AppShellProps) {
  return (
    <div className={cn('shell-frame', variant === 'fill' && 'h-svh')}>
      {header}
      <main
        className={cn(
          'container-column shell-x flex min-h-0 flex-1 flex-col',
          variant === 'scroll' && 'shell-y',
        )}
      >
        {children}
      </main>
      {footer}
    </div>
  )
}
