import { FolderIcon, GearIcon, LifebuoyIcon, ListIcon, SignOutIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { authService } from '@web/lib/auth/auth-service.ts'
import { REPOSITORY_URL } from '@web/lib/product.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@web/ui/components/ui/drawer.tsx'
import { toast } from '@web/ui/components/ui/sonner.tsx'
import type { ReactNode } from 'react'

/**
 * One place to go, marked when you are already there.
 *
 * The mark is the hover shade, held. Anything louder competes with the row a
 * thumb is about to press, and the point is only to say "not this one".
 *
 * Not exact: a conversation is still inside the list it came from.
 */
function MenuLink({
  to,
  icon,
  label,
}: {
  readonly to: '/conversations' | '/account'
  readonly icon: ReactNode
  readonly label: string
}) {
  return (
    <DrawerClose
      render={
        <Button
          className="h-11 w-full justify-start gap-2"
          nativeButton={false}
          variant="ghost"
          render={
            <Link
              activeOptions={{ exact: false }}
              activeProps={{ className: 'bg-surface-hover' }}
              to={to}
            />
          }
        >
          {icon}
          {label}
        </Button>
      }
    />
  )
}

/**
 * Everything about the account, one tap from any page.
 *
 * A drawer rather than a dropdown: this is the phone's primary navigation, and
 * a menu anchored to a top corner is out of reach of the thumb holding the
 * phone. It closes by swiping down, so leaving costs no aim at all.
 */
export function AppMenu() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // The cache is cleared after leaving the protected tree, not before: clearing
  // while a protected route is still mounted makes its live queries refetch
  // under an identity that no longer exists, and the page waits on its own 401s.
  const signOut = useMutation({
    mutationFn: () => authService().signOut(),
    onMutate: () => queryClient.cancelQueries(),
    onSuccess: async () => {
      await navigate({ to: '/', replace: true })
      queryClient.clear()
    },
    onError: () => {
      toast.error('Could not sign out', { description: 'Try again in a moment.' })
    },
  })

  return (
    <Drawer>
      <DrawerTrigger
        render={
          <Button aria-label="Open menu" size="icon" variant="ghost">
            <ListIcon aria-hidden />
          </Button>
        }
      />
      <DrawerContent>
        {/* Written but not shown: a dialog needs a name, and one row of links
            already says what this is. */}
        <DrawerTitle className="sr-only">Menu</DrawerTitle>

        {/* `ghost` is already the dropdown menu's hover, so both menus behave
            the same without a second set of rules. Log out only recolours. */}
        <nav className="flex flex-col gap-0.5 px-2">
          <MenuLink icon={<FolderIcon aria-hidden />} label="Conversations" to="/conversations" />
          <MenuLink icon={<GearIcon aria-hidden />} label="Account" to="/account" />
          {/* Leaves the app, so it says so and opens where a report belongs. */}
          <Button
            className="h-11 w-full justify-start gap-2"
            nativeButton={false}
            variant="ghost"
            render={
              <a href={`${REPOSITORY_URL}/issues`} rel="noreferrer noopener" target="_blank">
                <LifebuoyIcon aria-hidden />
                Support
              </a>
            }
          />
          {/* The primitive's own destructive treatment. Hand-mixing one here is
              what the design system forbids, and it would drift from every
              other destructive control. */}
          <Button
            className="h-11 w-full justify-start gap-2"
            disabled={signOut.isPending}
            variant="destructive"
            onClick={() => {
              signOut.mutate()
            }}
          >
            <SignOutIcon aria-hidden />
            Log out
          </Button>
        </nav>
      </DrawerContent>
    </Drawer>
  )
}
