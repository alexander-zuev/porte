import { createFileRoute, Outlet } from '@tanstack/react-router'
import { RelayProvider } from '@web/entities/host/relay-context.tsx'

export const Route = createFileRoute('/_auth/_relay')({
  component: RelayLayout,
})

/**
 * One line to the Mac, for the routes that read from it.
 *
 * Pathless, so it changes no URL. It exists to bound the socket: the list and a
 * conversation share this parent, so moving between them leaves it mounted,
 * while account and pairing never open one.
 *
 * Being matched is also what tells the header to name the Mac. Nothing is
 * declared for that: this layout already means "wired to the Mac".
 */
function RelayLayout() {
  return (
    <RelayProvider>
      <Outlet />
    </RelayProvider>
  )
}
