import { authClient } from '#/lib/clients/auth.client.ts'
import { Button } from '#/ui/components/ui/button.tsx'

export default function BetterAuthHeader() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return <div className="h-8 w-8 animate-pulse bg-neutral-100 dark:bg-neutral-800" />
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        {session.user.image ? (
          <img src={session.user.image} alt="" className="h-8 w-8" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center bg-neutral-100 dark:bg-neutral-800">
            <small className="text-neutral-600 dark:text-neutral-400">
              {session.user.name.charAt(0).toUpperCase() || 'U'}
            </small>
          </div>
        )}
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
