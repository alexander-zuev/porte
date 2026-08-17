import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

type AppFrameProps = {
  readonly children: ReactNode
  readonly className?: string
}

/** Phone-width shell used by flow stories and later pages. */
export function AppFrame({ children, className }: AppFrameProps) {
  return (
    <main
      className={cn(
        'dark mx-auto flex min-h-svh w-full max-w-md flex-col bg-background text-foreground',
        className,
      )}
    >
      {children}
    </main>
  )
}
