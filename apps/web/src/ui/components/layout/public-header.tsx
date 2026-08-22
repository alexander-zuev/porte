import { CaretLeftIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { HeaderAccount } from '@web/features/auth/components/header-account.tsx'
import { ShellHeader } from '@web/ui/components/layout/shell-header.tsx'
import { Logo } from '@web/ui/components/logo.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import type { ReactNode } from 'react'

/** Stable reference: a JSX default would be a new element on every render. */
const DEFAULT_ACTION = <HeaderAccount />
const DEFAULT_LEAD = (
  <Link aria-label="Porte home" to="/">
    <Logo size="sm" />
  </Link>
)

/** Header shared by every public page. `ShellHeader` holds the geometry the app shares. */
export function PublicHeader({
  action = DEFAULT_ACTION,
  lead = DEFAULT_LEAD,
}: {
  readonly action?: ReactNode
  /** What sits at the left edge. Pages built around one decision put Home here. */
  readonly lead?: ReactNode
}) {
  return (
    <ShellHeader
      action={action}
      className="bg-gradient-to-b from-background to-transparent"
      lead={lead}
      measure="page"
    />
  )
}

/** The way back, where the wordmark sits on every other page. */
export function HomeLink() {
  return (
    <Button
      className="text-muted-foreground"
      nativeButton={false}
      size="sm"
      variant="ghost"
      render={<Link to="/" />}
    >
      <CaretLeftIcon data-icon="inline-start" />
      Home
    </Button>
  )
}
