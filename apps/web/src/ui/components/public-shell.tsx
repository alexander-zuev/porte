import { CaretLeftIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { REPOSITORY_URL } from '@web/lib/product.ts'
import { Logo } from '@web/ui/components/logo.tsx'
import { MarketingBackground } from '@web/ui/components/marketing-background.tsx'
import { MarketingHeader } from '@web/ui/components/marketing-header.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import type { ReactNode } from 'react'

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
  /**
   * Offer the way back to the marketing page.
   *
   * Off inside pairing: the person is partway through a task started in a
   * terminal, and leaving loses a code that expires either way.
   */
  readonly back?: boolean
}

/** Header and footer shared by every page outside the app. */
export function PublicShell({
  children,
  action,
  background = false,
  footer = 'full',
  header = 'bar',
  back = true,
}: PublicShellProps) {
  return (
    <main className="dark relative isolate flex min-h-svh w-full flex-col overflow-hidden bg-background text-foreground">
      {background ? <MarketingBackground /> : null}
      {/*
        One bar on every public page, so the outer padding never changes. A page
        built around one decision carries only the way back: an account control
        beside a sign-in form, or beside a pairing card, is noise.
      */}
      <MarketingHeader action={header === 'brand' ? null : action} lead={brandLead(header, back)} />
      {header === 'brand' ? <BrandColumn>{children}</BrandColumn> : children}
      {footer === 'full' ? <FullFooter /> : <LegalFooter />}
    </main>
  )
}

/**
 * What sits at the header's left edge.
 *
 * Null rather than nothing when there is no way back: leaving it unset lets the
 * header fall back to its own wordmark, which the brand column below is already
 * showing.
 */
function brandLead(header: 'bar' | 'brand', back: boolean): ReactNode | undefined {
  if (header !== 'brand') return undefined
  return back ? <HomeLink /> : null
}

/** The way back, where the wordmark sits on every other page. */
function HomeLink() {
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

/** Wordmark and content as one column, centred in whatever height is left. */
function BrandColumn({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-5">
      <Link aria-label="Porte home" to="/">
        <Logo size="lg" />
      </Link>
      {children}
    </div>
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
