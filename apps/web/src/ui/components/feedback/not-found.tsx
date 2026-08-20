import { Link } from '@tanstack/react-router'

import { Button } from '../ui/button.tsx'

/**
 * The fallback for an unmatched route.
 *
 * Porte is French for door, so a missing page is one that opens onto nothing.
 * Light, and still says plainly what happened and where to go.
 */
export function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <section className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1>This door opens onto nothing</h1>
        <p className="text-muted-foreground">
          No page lives at this address. The ones that do are back the other way.
        </p>
        <Button className="min-h-11" nativeButton={false} render={<Link to="/" />}>
          Take me back
        </Button>
      </section>
    </main>
  )
}
