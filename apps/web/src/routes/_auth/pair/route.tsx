import { createFileRoute, Outlet } from '@tanstack/react-router'
import { PublicShell } from '@web/ui/components/layout/public-shell.tsx'
import { LogoLink } from '@web/ui/components/logo.tsx'

export const Route = createFileRoute('/_auth/pair')({
  component: PairLayout,
})

/**
 * Pairing is behind the session but outside the app, so it borrows the public
 * frame. `back` is off for every step: the code in the terminal expires either
 * way, and leaving loses it.
 */
function PairLayout() {
  return (
    <PublicShell back={false} variant="card">
      {/* Held here, not per step, so it does not move as a step grows taller. */}
      <LogoLink />
      <Outlet />
    </PublicShell>
  )
}
