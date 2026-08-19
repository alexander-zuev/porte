import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Logo } from '#/ui/components/logo.tsx'

/**
 * Header shared by every public page.
 *
 * The height is fixed so the wordmark keeps its exact position when a route
 * with an action swaps to one without.
 */
export function MarketingHeader({ action }: { readonly action?: ReactNode }) {
  return (
    <header className="bg-gradient-to-b from-background to-transparent">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-4 px-6 md:px-10">
        <Link aria-label="Porte home" to="/">
          <Logo size="sm" />
        </Link>
        {action}
      </div>
    </header>
  )
}
