import { ensureSession } from '@server/entrypoints/functions/auth.fn.ts'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { UnseenConversationsProvider } from '@web/entities/conversation/unseen-conversations-context.tsx'
import { signInSearchFromLocation } from '@web/lib/auth/internal-return-to.ts'
import { RelayProvider } from '@web/lib/relay/relay-provider.tsx'
import { useAppShellVariant } from '@web/lib/router/use-shell-variant.ts'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'

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
 * Everything behind the session, in one frame.
 *
 * The shell and the relay socket are here rather than a layer below, so signing
 * in and moving between pairing, the list, and settings never rebuilds either.
 * Pages ask for the shape they need through `staticData`, because a child
 * cannot pass props to the layout that renders its `Outlet`.
 */
function AuthLayout() {
  const variant = useAppShellVariant('scroll')

  return (
    <RelayProvider>
      <UnseenConversationsProvider>
        <AppShell header={<AppHeader />} variant={variant}>
          <Outlet />
        </AppShell>
      </UnseenConversationsProvider>
    </RelayProvider>
  )
}
