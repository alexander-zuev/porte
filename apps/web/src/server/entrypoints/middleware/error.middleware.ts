import { createLogger, type ApiError, type ApiResponse } from '@porte/core'
import { isNotFound, isRedirect, redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { deleteCookie } from '@tanstack/react-start/server'

import { ApiRouteError } from '../../errors/api-route.error.ts'
import { AuthenticationError } from '../../errors/authentication.error.ts'
import { StaleSessionError } from '../../errors/stale-session.error.ts'

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

/**
 * Better Auth splits its cookie across a name, a `__Secure-` twin, and numbered
 * chunks for the larger payloads. Leaving any behind re-presents a dead session
 * on the next request, which fails the same way and looks like a broken account.
 */
const STALE_COOKIE_NAMES = [
  'session_token',
  'session_data',
  'account_data',
  'dont_remember',
] as const

function clearStaleSessionCookies(): void {
  for (const suffix of STALE_COOKIE_NAMES) {
    const base = `better-auth.${suffix}`
    const names = [base, `__Secure-${base}`]

    for (const name of names) {
      deleteCookie(name, { path: '/' })
      // Chunked payloads land beside the base name; a missed chunk resurrects it.
      for (let chunk = 0; chunk < 10; chunk++) deleteCookie(`${name}.${chunk}`, { path: '/' })
    }
  }
}

/**
 * Settle the final error of a server function once.
 *
 * A dead cookie is cleared before the redirect, so signing in again starts from
 * nothing rather than re-presenting the session that just failed. Anything
 * unrecognised is logged here and nowhere else, then passed on unchanged.
 */
function handleFunctionError(cause: unknown): never {
  // oxlint-disable-next-line typescript/only-throw-error -- TanStack uses throwable control-flow objects.
  if (isNotFound(cause) || isRedirect(cause)) throw cause

  if (cause instanceof StaleSessionError) {
    clearStaleSessionCookies()
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router performs redirects by throwing this value.
    throw redirect({ to: '/sign-in', search: { reason: 'session-expired' } })
  }
  if (cause instanceof AuthenticationError) {
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router performs redirects by throwing this value.
    throw redirect({ to: '/sign-in', search: {} })
  }

  logger.error('server_function_failed', { error: cause })
  throw cause
}

/**
 * The same boundary for server functions.
 *
 * Registered globally in `start.ts`, because every signed-in function runs
 * `requireAuth` and both of its refusals need somewhere to land.
 */
export const functionErrorMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    try {
      return await next()
    } catch (cause) {
      return handleFunctionError(cause)
    }
  },
)
