import { Link, useRouteContext } from '@tanstack/react-router'

import { Button } from '#/ui/components/ui/button.tsx'

import { UserMenu } from './user-menu.tsx'

/**
 * The account, at the header's right edge.
 *
 * Signed in gets both: the way back into the app, and the menu that manages the
 * account behind it. Signed out has only one thing to offer.
 */
export function HeaderAccount() {
  const { user } = useRouteContext({ from: '/_public' })

  if (!user) {
    return (
      <Button nativeButton={false} size="sm" variant="ghost" render={<Link to="/sign-in" />}>
        Sign in
      </Button>
    )
  }

  return (
    // Account first, then the way in: the button is the primary action here.
    <div className="flex items-center gap-3">
      <UserMenu user={user} />
      <Button nativeButton={false} size="sm" render={<Link to="/dashboard" />}>
        Dashboard
      </Button>
    </div>
  )
}
