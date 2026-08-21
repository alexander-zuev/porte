import { CaretDownIcon } from '@phosphor-icons/react'
import { buildImageProxyUrl } from '@porte/core/client'
import { cn } from '@web/lib/utils.ts'
import { Avatar, AvatarFallback, AvatarImage } from '@web/ui/components/ui/avatar.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import type { RefObject } from 'react'

/** What the header and the sidebar footer need to draw an account. */
export type MenuUser = {
  readonly name: string
  readonly email: string
  readonly image?: string | null
}

export type UserAvatarProps = {
  readonly user: MenuUser
  /** `image-only` sits in the header; `default` fills a sidebar footer. */
  readonly variant?: 'default' | 'image-only'
  readonly showChevron?: boolean
  readonly className?: string
  readonly ref?: RefObject<HTMLButtonElement | null>
}

/**
 * The trigger, as a real control.
 *
 * The menu renders this through `render=` and hands it the props that make it a
 * trigger, so it has to forward everything it is given.
 */
export function UserAvatar({
  ref,
  user,
  variant = 'default',
  showChevron = false,
  className,
  ...triggerProps
}: UserAvatarProps) {
  const imageUrl = buildImageProxyUrl('', user.image ?? null)

  const picture = (
    <Avatar className="size-8 shrink-0">
      {imageUrl ? <AvatarImage alt="" src={imageUrl} /> : null}
      <AvatarFallback>{initial(user)}</AvatarFallback>
    </Avatar>
  )

  if (variant === 'image-only') {
    return (
      <Button
        ref={ref}
        aria-label="Account menu"
        className={cn('size-8 rounded-full p-0', className)}
        size="icon-sm"
        variant="ghost"
        {...triggerProps}
      >
        {picture}
      </Button>
    )
  }

  return (
    <Button
      ref={ref}
      aria-label="Account menu"
      className={cn('h-auto w-full justify-start gap-3 p-2', className)}
      variant="ghost"
      {...triggerProps}
    >
      {picture}
      <span className="min-w-0 flex-1 truncate text-left" title={user.email}>
        {user.email}
      </span>
      {showChevron ? <CaretDownIcon className="shrink-0 text-muted-foreground" /> : null}
    </Button>
  )
}

/** Name first, then email: whichever the account actually has. */
function initial(user: MenuUser): string {
  return (user.name || user.email).charAt(0).toUpperCase()
}
