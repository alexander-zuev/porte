import { createLogger } from '@porte/core/client'
import { getSession } from '@server/entrypoints/functions/auth.fn.ts'
import { createFileRoute, Outlet } from '@tanstack/react-router'

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

function PublicLayout() {
  return <Outlet />
}
