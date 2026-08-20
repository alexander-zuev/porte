import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { HeaderAccount } from '#/features/auth/components/header-account.tsx'
import { Logo } from '#/ui/components/logo.tsx'

/** Stable reference: a JSX default would be a new element on every render. */
const DEFAULT_ACTION = <HeaderAccount />
const DEFAULT_LEAD = (
  <Link aria-label="Porte home" to="/">
    <Logo size="sm" />
  </Link>
)

/**
 * Header shared by every public page.
 *
 * The height is fixed so what sits at the left keeps its exact position when a
 * route swaps the wordmark for a way back, or an action for none.
 */
export function MarketingHeader({
  action = DEFAULT_ACTION,
  lead = DEFAULT_LEAD,
}: {
  readonly action?: ReactNode
  /** What sits at the left edge. Pages built around one decision put Home here. */
  readonly lead?: ReactNode
}) {
  return (
    <header className="bg-gradient-to-b from-background to-transparent">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-4 px-6 md:px-10">
        {lead}
        {action}
      </div>
    </header>
  )
}
