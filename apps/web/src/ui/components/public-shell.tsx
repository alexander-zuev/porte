import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { REPOSITORY_URL } from '#/lib/product.ts'
import { MarketingBackground } from '#/ui/components/marketing-background.tsx'
import { MarketingFrame } from '#/ui/components/marketing-frame.tsx'
import { MarketingHeader } from '#/ui/components/marketing-header.tsx'

/** Props for the shell wrapped around every public page. */
export type PublicShellProps = {
  readonly children: ReactNode
  /** Optional control shown at the header's right edge. */
  readonly action?: ReactNode
  /** Draw the animated terminal field. The landing opts in; other pages stay plain. */
  readonly background?: boolean
  /** `full` carries the product links; `legal` carries Terms and Privacy alone. */
  readonly footer?: 'full' | 'legal'
}

/** Header and footer shared by every page outside the app. */
export function PublicShell({
  children,
  action,
  background = false,
  footer = 'full',
}: PublicShellProps) {
  return (
    <MarketingFrame className="relative isolate flex min-h-svh flex-col overflow-hidden">
      {background ? <MarketingBackground /> : null}
      <MarketingHeader action={action} />
      {children}
      {footer === 'full' ? <FullFooter /> : <LegalFooter />}
    </MarketingFrame>
  )
}

function FullFooter() {
  return (
    <FooterBar>
      <small className="text-muted-foreground">Remote control for local Grok sessions</small>
      <nav className="flex items-center gap-5">
        <a href={REPOSITORY_URL} rel="noreferrer" target="_blank">
          <small>GitHub</small>
        </a>
        <LegalLinks />
      </nav>
    </FooterBar>
  )
}

function LegalFooter() {
  return (
    <FooterBar>
      <nav className="flex w-full items-center justify-center gap-5">
        <LegalLinks />
      </nav>
    </FooterBar>
  )
}

function LegalLinks() {
  return (
    <>
      <Link to="/terms">
        <small>Terms</small>
      </Link>
      <Link to="/privacy">
        <small>Privacy</small>
      </Link>
    </>
  )
}

function FooterBar({ children }: { readonly children: ReactNode }) {
  return (
    <footer className="bg-gradient-to-t from-background to-transparent">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-5 md:px-10">
        {children}
      </div>
    </footer>
  )
}
