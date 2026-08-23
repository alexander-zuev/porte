import { createLogger, isTransientTransportError, type DomainErrorTag } from '@porte/core/client'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { errorPayloadTagOf } from '@web/lib/errors/error-payload.ts'

const logger = createLogger('query-client')

const RETRY_ATTEMPTS = 2

/**
 * The only failures that answer differently to the same question.
 *
 * Both say the server could not get to the work, not that the work was wrong.
 * An offline Mac is deliberately absent: it comes back when someone starts the
 * daemon, and the relay says so on its own, so asking again only burns requests.
 */
const RETRIED: ReadonlySet<DomainErrorTag> = new Set([
  'ServiceUnavailableError',
  'RequestTimeoutError',
])

/**
 * No tag means the request never reached the Worker.
 *
 * Only some of those are worth repeating: a dropped connection is, a cancelled
 * navigation and a bug in this bundle are not. The same rule the server uses on
 * its own boundaries decides it, so both ends agree on what transient means.
 */
function shouldRetry(attempt: number, cause: unknown): boolean {
  if (attempt >= RETRY_ATTEMPTS) return false

  const tag = errorPayloadTagOf(cause)
  return tag === null ? isTransientTransportError(cause) : RETRIED.has(tag)
}

/** Create an isolated query client for one router instance. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    // Reads only. A mutation is repeated by the one that knows it is safe to.
    defaultOptions: { queries: { retry: shouldRetry } },
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isNotFound(error) || isRedirect(error)) return
        logger.error('query_failed', {
          error,
          details: { queryKey: JSON.stringify(query.queryKey) },
        })
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (isNotFound(error) || isRedirect(error)) return
        logger.error('mutation_failed', {
          error,
          details: { mutationKey: JSON.stringify(mutation.options.mutationKey) },
        })
      },
    }),
  })
}
