import type { AppDeps } from './infrastructure/app-deps.ts'

/** What this app puts in TanStack Start's request context. */
declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: {
        deps: AppDeps
      }
    }
  }
}
