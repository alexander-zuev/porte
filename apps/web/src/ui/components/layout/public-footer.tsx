import { Link } from '@tanstack/react-router'
import { REPOSITORY_URL } from '@web/lib/product.ts'
import type { ReactNode } from 'react'

/** Props for the footer shared by every public page. */
export type PublicFooterProps = {
  /** `full` carries the product links; `legal` carries Terms and Privacy alone. */
  readonly variant: 'full' | 'legal'
}

/** Footer shared by every page outside the app. */
export function PublicFooter({ variant }: PublicFooterProps) {
  if (variant === 'legal') {
    return (
      <FooterBar>
        <nav className="flex w-full items-center justify-center gap-5">
          <LegalLinks />
        </nav>
      </FooterBar>
    )
  }

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

/** Quiet until pointed at, then it reads as the link it is. */
const FOOTER_LINK =
  'text-muted-foreground transition-colors duration-200 hover:text-foreground hover:underline'

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
      <div className="container-page shell-x flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5">
        {children}
      </div>
    </footer>
  )
}
