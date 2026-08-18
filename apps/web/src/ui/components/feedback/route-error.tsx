import * as Sentry from '@sentry/tanstackstart-react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { useEffect } from 'react'

import { Button } from '../ui/button.tsx'

/** Report a route error and show a safe application fallback. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <section className="flex max-w-sm flex-col items-center gap-4 text-center" role="alert">
        <h1>Something went wrong</h1>
        <p className="text-muted-foreground">Try the action again.</p>
        <Button onClick={reset}>Try again</Button>
      </section>
    </main>
  )
}
