import { ensureSession } from '@server/entrypoints/functions/auth.fn.ts'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { signInSearchFromLocation } from '@web/lib/auth/internal-return-to.ts'

export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ location }) => {
    try {
      const session = await ensureSession()
      return { user: session.user }
    } catch {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router performs redirects by throwing this value.
      throw redirect({
        to: '/sign-in',
        search: signInSearchFromLocation(location),
      })
    }
  },
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex' }],
  }),
  component: AuthLayout,
})

/** Everything behind the session. The relay's own layout is nested inside. */
function AuthLayout() {
  return <Outlet />
}
