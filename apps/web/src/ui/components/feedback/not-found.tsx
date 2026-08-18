import { Link } from '@tanstack/react-router'

import { Button } from '../ui/button.tsx'

/** Show the application fallback for an unmatched route. */
export function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <section className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1>Page not found</h1>
        <p className="text-muted-foreground">This page does not exist.</p>
        <Button nativeButton={false} render={<Link to="/" />}>
          Go home
        </Button>
      </section>
    </main>
  )
}
