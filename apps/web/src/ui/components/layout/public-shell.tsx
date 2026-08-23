import { LandingBackground } from '@web/ui/components/layout/landing-background.tsx'
import { PublicFooter } from '@web/ui/components/layout/public-footer.tsx'
import { HomeLink, PublicHeader } from '@web/ui/components/layout/public-header.tsx'
import type { ReactNode } from 'react'

/**
 * `hero` is one screen at full width. `article` is a document at the reading
 * measure. `card` is one thing to do, centred in what the bar and footer leave.
 */
export type PublicShellVariant = 'hero' | 'article' | 'card'

export type PublicShellProps = {
  readonly variant: PublicShellVariant
  /**
   * Offer the way back to the landing page.
   *
   * Off inside pairing: the person is partway through a task started in a
   * terminal, and leaving loses a code that expires either way.
   */
  readonly back?: boolean
  readonly children: ReactNode
}

/** The frame every page outside the app renders in. */
export function PublicShell({ variant, back = true, children }: PublicShellProps) {
  if (variant === 'card') {
    return (
      <div className="shell-frame">
        {/* Null, not unset: unset falls back to the wordmark and the account
            control, and a page built around one decision carries neither. */}
        <PublicHeader action={null} lead={back ? <HomeLink /> : null} />
        {/* Same shape as the app shell's `card`, so one word means one layout. */}
        <main className="shell-x flex flex-1 flex-col items-center justify-center gap-10 py-12">
          {children}
        </main>
        <PublicFooter variant="legal" />
      </div>
    )
  }

  if (variant === 'article') {
    return (
      <div className="shell-frame">
        <PublicHeader />
        <main className="container-column shell-x shell-y flex-1">{children}</main>
        <PublicFooter variant="full" />
      </div>
    )
  }

  return (
    <div className="shell-frame isolate overflow-hidden">
      <LandingBackground />
      <PublicHeader />
      <main className="container-page shell-x flex flex-1 flex-col justify-center">{children}</main>
      <PublicFooter variant="full" />
    </div>
  )
}
