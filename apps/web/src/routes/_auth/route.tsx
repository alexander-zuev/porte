import { ensureSession } from '@server/entrypoints/functions/auth.fn.ts'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { RelayProvider } from '@web/entities/host/relay-context.tsx'
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

/**
 * One line to the Mac for the whole signed-in session.
 *
 * Opened here rather than in a page, so moving between conversations does not
 * close and reopen a socket the relay would count as a second browser.
 */
function AuthLayout() {
  return (
    <RelayProvider>
      <Outlet />
    </RelayProvider>
  )
}
