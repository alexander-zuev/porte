import { authClient } from '#/lib/clients/auth.client.ts'
import { Avatar, AvatarFallback, AvatarImage } from '#/ui/components/ui/avatar.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import { Skeleton } from '#/ui/components/ui/skeleton.tsx'

export default function BetterAuthHeader() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return <Skeleton className="size-8 rounded-full" />
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Avatar>
          {session.user.image ? (
            <AvatarImage alt={`${session.user.name}'s profile picture`} src={session.user.image} />
          ) : null}
          <AvatarFallback>{session.user.name.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
        </Avatar>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void authClient.signOut()
          }}
          className="flex-1"
        >
          Sign out
        </Button>
      </div>
    )
  }

  return null
}
