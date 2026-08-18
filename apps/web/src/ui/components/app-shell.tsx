import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

type AppShellProps = {
  readonly list?: ReactNode
  readonly children?: ReactNode
}

/** Phone: one pane. From md: list | thread when both exist. */
export function AppShell({ list, children }: AppShellProps) {
  const hasList = list !== undefined
  const hasMain = children !== undefined

  const listClassName = cn(
    'flex min-h-svh w-full flex-col border-border md:max-w-sm md:shrink-0 md:border-r',
    hasMain ? 'hidden md:flex' : 'flex',
  )

  return (
    <div className="dark flex min-h-svh w-full bg-background text-foreground">
      {hasList ? (
        hasMain ? (
          <aside className={listClassName}>{list}</aside>
        ) : (
          <main className={listClassName}>{list}</main>
        )
      ) : null}
      {hasMain ? <main className="flex min-h-svh min-w-0 flex-1 flex-col">{children}</main> : null}
    </div>
  )
}
