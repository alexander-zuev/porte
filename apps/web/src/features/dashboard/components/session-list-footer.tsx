import { UserMenu, type MenuUser } from '#/features/auth/components/user-menu.tsx'

/** Account entry pinned to the base of the list pane. */
export function SessionListFooter({ user }: { readonly user: MenuUser }) {
  return (
    <div className="border-t border-border px-2 py-2">
      {/* Anchored to the base of the pane, so the popup opens upward. */}
      <UserMenu side="top" user={user} variant="default" />
    </div>
  )
}
