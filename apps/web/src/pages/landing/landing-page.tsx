import { ArrowRightIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import { Logo } from '#/ui/components/logo.tsx'
import { MarketingFrame } from '#/ui/components/marketing-frame.tsx'
import { Button } from '#/ui/components/ui/button.tsx'

export function LandingPage() {
  return (
    <MarketingFrame className="relative isolate flex min-h-svh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-[min(36rem,50vw)] bg-border md:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px translate-x-[min(36rem,50vw)] bg-border md:block"
      />

      <header className="flex items-center justify-between px-6 py-6 md:px-10">
        <Logo size="sm" />
      </header>

      <div className="flex flex-1 flex-col justify-end px-6 pb-10 md:justify-center md:px-10 md:pb-24">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
          <h1 className="text-display-hero max-w-[14ch]">Grok. From the phone.</h1>
          <p className="max-w-[32ch] text-muted-foreground">
            Pair the Mac. Open a session. Approve the work. The laptop never listens.
          </p>
          <div>
            <Button nativeButton={false} render={<Link to="/sign-in" />}>
              Enter
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </div>

      <footer className="border-t border-border px-6 py-5 md:px-10">
        <small className="text-muted-foreground">Pair · Resume · Approve</small>
      </footer>
    </MarketingFrame>
  )
}
