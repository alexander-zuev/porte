import { createFileRoute, Outlet } from '@tanstack/react-router'
import { PublicFooter } from '@web/ui/components/layout/public-footer.tsx'

export const Route = createFileRoute('/_auth/pair')({
  staticData: { appShell: 'card' },
  component: PairLayout,
})

/**
 * Pairing, inside the app frame it is on its way into.
 *
 * `card` holds one step below the bar, so a taller step does not move what sits
 * above it. The legal footer stays: this is where an account is bound to a
 * machine, and the terms belong in view.
 *
 * There is no Mac yet, so the bar names none. It carries the wordmark and the
 * menu, which is the way out for somebody stuck partway through.
 */
function PairLayout() {
  return (
    <>
      <Outlet />
      <PublicFooter variant="legal" />
    </>
  )
}
