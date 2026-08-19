import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

type AppShellProps = {
  readonly list?: ReactNode
  readonly children?: ReactNode
  /** Host status and account entry, pinned to the base of the list pane. */
  readonly footer?: ReactNode
  readonly mobilePane?: 'list' | 'detail'
}

/** Phone: one pane. From md: list | thread when both exist. */
export function AppShell({ list, children, footer, mobilePane = 'detail' }: AppShellProps) {
  const hasList = list !== undefined
  const hasMain = children !== undefined

  const listClassName = cn(
    'min-h-svh w-full flex-col border-border md:flex md:max-w-sm md:shrink-0 md:border-r',
    hasMain && mobilePane === 'detail' ? 'hidden' : 'flex',
  )

  const mainClassName = cn(
    'min-h-svh min-w-0 flex-1 flex-col md:flex',
    hasList && mobilePane === 'list' ? 'hidden' : 'flex',
  )

  return (
    <div className="dark flex min-h-svh w-full bg-background text-foreground">
      {hasList ? (
        hasMain ? (
          <aside className={listClassName}>
            <div className="flex min-h-0 flex-1 flex-col">{list}</div>
            {footer}
          </aside>
        ) : (
          <main className={listClassName}>
            <div className="flex min-h-0 flex-1 flex-col">{list}</div>
            {footer}
          </main>
        )
      ) : null}
      {hasMain ? <main className={mainClassName}>{children}</main> : null}
    </div>
  )
}
