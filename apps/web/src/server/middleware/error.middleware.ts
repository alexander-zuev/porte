import { createLogger, type ApiError, type ApiResponse } from '@porte/core'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'

import { ApiRouteError } from '../errors/api-route.error.ts'

const logger = createLogger('api-route')

/** Convert one API error to the published HTTP envelope. */
export function apiErrorResponse(error: ApiError, status: number): Response {
  const body = { success: false, error } satisfies ApiResponse<never>
  return Response.json(body, { status })
}

function handleRouteError(cause: unknown): Response {
  // oxlint-disable-next-line typescript/only-throw-error -- TanStack uses throwable control-flow objects.
  if (isNotFound(cause) || isRedirect(cause)) throw cause
  if (cause instanceof ApiRouteError) return apiErrorResponse(cause.error, cause.status)

  logger.error('api_route_failed', { error: cause })
  return apiErrorResponse({ code: 'INTERNAL_ERROR', message: 'An internal error occurred' }, 500)
}

/** Convert the final route error once and preserve TanStack control flow. */
export const routeErrorMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    try {
      return await next()
    } catch (cause) {
      return handleRouteError(cause)
    }
  },
)
