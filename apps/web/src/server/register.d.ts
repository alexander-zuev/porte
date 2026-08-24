import type { PorteWorkerResources } from './infrastructure/porte-worker-resources.ts'

/** What this app puts in TanStack Start's request context. */
declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: {
        deps: PorteWorkerResources
      }
    }
  }
}
