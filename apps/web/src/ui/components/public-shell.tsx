import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { REPOSITORY_URL } from '#/lib/product.ts'
import { Logo } from '#/ui/components/logo.tsx'
import { MarketingBackground } from '#/ui/components/marketing-background.tsx'
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
  /**
   * `bar` puts the wordmark at the left, beside any action.
   * `brand` centres it large above a single focused card.
   */
  readonly header?: 'bar' | 'brand'
}

/** Header and footer shared by every page outside the app. */
export function PublicShell({
  children,
  action,
  background = false,
  footer = 'full',
  header = 'bar',
}: PublicShellProps) {
  return (
    <main className="dark relative isolate flex min-h-svh w-full flex-col overflow-hidden bg-background text-foreground">
      {background ? <MarketingBackground /> : null}
      {header === 'bar' ? <MarketingHeader action={action} /> : <BrandHeader />}
      {children}
      {footer === 'full' ? <FullFooter /> : <LegalFooter />}
    </main>
  )
}

/** The wordmark alone, centred, for a page that is one decision. */
function BrandHeader() {
  return (
    <header className="flex justify-center px-6 pt-16 pb-10">
      <Link aria-label="Porte home" to="/">
        <Logo size="lg" />
      </Link>
    </header>
  )
}

/** Quiet until pointed at, then it reads as the link it is. */
const FOOTER_LINK =
  'text-muted-foreground transition-colors duration-200 hover:text-foreground hover:underline'

function FullFooter() {
  return (
    <FooterBar>
      <small className="text-muted-foreground">Remote control for local Grok sessions</small>
      <nav className="flex items-center gap-5">
        <a className={FOOTER_LINK} href={REPOSITORY_URL} rel="noreferrer" target="_blank">
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
      <Link className={FOOTER_LINK} to="/terms">
        <small>Terms</small>
      </Link>
      <Link className={FOOTER_LINK} to="/privacy">
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
