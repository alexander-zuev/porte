import { createFileRoute, Outlet } from '@tanstack/react-router'
import { RelayProvider } from '@web/entities/host/relay-context.tsx'

export const Route = createFileRoute('/_auth/_relay')({
  component: RelayLayout,
})

/**
 * One line to the Mac, for the routes that read from it.
 *
 * Pathless, so it changes no URL. It exists to bound the socket: the list, a
 * conversation, and account share this parent, so moving between them leaves it
 * mounted rather than closing a socket and opening it again on the way back.
 * Pairing and the public pages never open one.
 *
 * Account is here for the Mac's status, which has no other writer. It is not
 * here to control the Mac, so the header names the conversation routes instead
 * of this layout.
 */
function RelayLayout() {
  return (
    <RelayProvider>
      <Outlet />
    </RelayProvider>
  )
}
