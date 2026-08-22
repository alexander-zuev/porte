import { createLogger } from '@porte/core/client'
import { getSession } from '@server/entrypoints/functions/auth.fn.ts'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { usePublicShellVariant } from '@web/lib/router/use-shell-variant.ts'
import { PublicShell } from '@web/ui/components/layout/public-shell.tsx'

const logger = createLogger('public-route')

export const Route = createFileRoute('/_public')({
  beforeLoad: async () => {
    try {
      const session = await getSession()
      return { user: session?.user ?? null }
    } catch (error) {
      logger.error('session_check_failed', { error })
      return { user: null }
    }
  },
  staleTime: 30_000,
  component: PublicLayout,
})

/**
 * The frame every page outside the app renders in.
 *
 * Pathless, so it changes no URL, and mounted here rather than per page so the
 * header and footer survive navigation between siblings instead of remounting.
 */
function PublicLayout() {
  const variant = usePublicShellVariant('article')
  return (
    <PublicShell variant={variant}>
      <Outlet />
    </PublicShell>
  )
}
