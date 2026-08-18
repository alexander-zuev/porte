import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

type MarketingFrameProps = {
  readonly children: ReactNode
  readonly className?: string
}

/** Full-width shell for landing, sign-in, and pair. */
export function MarketingFrame({ children, className }: MarketingFrameProps) {
  return (
    <main className={cn('dark min-h-svh w-full bg-background text-foreground', className)}>
      {children}
    </main>
  )
}
