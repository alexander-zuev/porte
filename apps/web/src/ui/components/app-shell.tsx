import type { ReactNode } from 'react'

type AppShellProps = {
  /** Sits above the content and scrolls with it. */
  readonly header?: ReactNode
  /** Account entry, held at the base of the column. */
  readonly footer?: ReactNode
  readonly children?: ReactNode
}

/**
 * The frame every signed-in route renders inside.
 *
 * One centred column at every width. A person pairs at a desk and then works
 * from a phone, so the two are the same page rather than two layouts that have
 * to agree. `svh` keeps the frame inside a mobile browser's smallest viewport,
 * so a toolbar appearing never crops the footer.
 */
export function AppShell({ header, footer, children }: AppShellProps) {
  return (
    <div className="dark flex min-h-svh w-full flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4">
        {header}
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        {footer}
      </div>
    </div>
  )
}
