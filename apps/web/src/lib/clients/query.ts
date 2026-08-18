import { createLogger } from '@lras/core'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isNotFound, isRedirect } from '@tanstack/react-router'

const logger = createLogger('query-client')

function isRouterControlFlow(error: Error): boolean {
  return isNotFound(error) || isRedirect(error)
}

/** Create an isolated query client for one router instance. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isRouterControlFlow(error)) return
        logger.error('query_failed', {
          error,
          details: { queryKey: JSON.stringify(query.queryKey) },
        })
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (isRouterControlFlow(error)) return
        logger.error('mutation_failed', {
          error,
          details: { mutationKey: JSON.stringify(mutation.options.mutationKey) },
        })
      },
    }),
  })
}
