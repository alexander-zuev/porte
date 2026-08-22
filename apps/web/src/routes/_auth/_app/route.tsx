import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useAppShellVariant } from '@web/lib/router/use-shell-variant.ts'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'

export const Route = createFileRoute('/_auth/_app')({
  component: AppLayout,
})

/**
 * The frame every page inside the app renders in.
 *
 * Pathless, so it changes no URL. Pairing sits outside it: there is no Mac yet,
 * so there is no app to frame.
 */
function AppLayout() {
  const variant = useAppShellVariant('scroll')
  return (
    <AppShell header={<AppHeader />} variant={variant}>
      <Outlet />
    </AppShell>
  )
}
