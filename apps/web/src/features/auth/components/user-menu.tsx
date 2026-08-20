import { SignOutIcon, UserIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { authService } from '@web/lib/auth/auth-service.ts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@web/ui/components/ui/dropdown-menu.tsx'
import { toast } from '@web/ui/components/ui/sonner.tsx'

import { UserAvatar, type MenuUser } from './user-avatar.tsx'

export type { MenuUser }

/**
 * The signed-in account, and the two things you can do with it.
 *
 * The cache is cleared after leaving the protected tree, not before: clearing
 * while a protected route is still mounted makes its live queries refetch under
 * an identity that no longer exists, and the page then waits on its own 401s.
 */
export function UserMenu({
  user,
  variant = 'image-only',
  side = 'bottom',
}: {
  readonly user: MenuUser
  readonly variant?: 'default' | 'image-only'
  /** Which way the popup opens. A sidebar footer anchors it upward. */
  readonly side?: 'top' | 'bottom'
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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
    <DropdownMenu modal={false}>
      {/* The trigger is a real button handed in, so the menu can own its props. */}
      <DropdownMenuTrigger render={<UserAvatar showChevron user={user} variant={variant} />} />
      <DropdownMenuContent
        align="start"
        // The popup is pinned to the trigger's width by default. An avatar is
        // 32px wide, so it has to be released; a row trigger already fits.
        className={variant === 'image-only' ? 'w-auto min-w-56' : 'w-(--anchor-width)'}
        side={side}
        sideOffset={8}
      >
        {/* Navigated, not rendered as a Link: `render` would replace the label. */}
        <DropdownMenuItem
          onClick={() => {
            void navigate({ to: '/account' })
          }}
        >
          <UserIcon />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={signOut.isPending}
          variant="destructive"
          onClick={() => {
            signOut.mutate()
          }}
        >
          <SignOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
