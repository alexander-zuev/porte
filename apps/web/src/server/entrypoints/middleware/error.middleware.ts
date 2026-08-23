import { StaleSessionError } from '@porte/core/client'
import { clearStaleSessionCookies } from '@server/infrastructure/auth/session-cookies.ts'
import { toErrorPayload } from '@server/infrastructure/errors/to-error-payload.ts'
import { toHttpErrorResponse } from '@server/infrastructure/http/http-error-response.ts'
import { isNotFound, isRedirect, redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'

/** A person can be sent somewhere, so an expired session becomes a redirect. */
function handleFunctionError(cause: unknown): never {
  // oxlint-disable-next-line typescript/only-throw-error -- TanStack uses throwable control-flow objects.
  if (isNotFound(cause) || isRedirect(cause)) throw cause

  if (cause instanceof StaleSessionError) {
    clearStaleSessionCookies()
    // oxlint-disable-next-line typescript/only-throw-error -- Router redirects by throwing this.
    throw redirect({ to: '/sign-in', search: { reason: 'session-expired' } })
  }

  // oxlint-disable-next-line typescript/only-throw-error -- The client rejects with this and reads its tag.
  throw toErrorPayload(cause)
}

/** A program cannot: a fetch that follows a redirect gets the HTML app shell. */
function handleRouteError(cause: unknown): Response {
  // oxlint-disable-next-line typescript/only-throw-error -- TanStack uses throwable control-flow objects.
  if (isNotFound(cause) || isRedirect(cause)) throw cause

  if (cause instanceof StaleSessionError) clearStaleSessionCookies()
  return toHttpErrorResponse(cause)
}

/** Global: every signed-in function runs `requireAuth`, whose refusals land here. */
export const functionErrorMiddleware = createMiddleware({ type: 'function' }).server(
  // oxlint-disable-next-line typescript/consistent-return -- `handleFunctionError` returns `never`.
  async ({ next }) => {
    try {
      return await next()
    } catch (cause) {
      handleFunctionError(cause)
    }
  },
)

/** Per-route — registered explicitly in API route `.middleware([])` arrays. */
export const routeErrorMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    try {
      return await next()
    } catch (cause) {
      return handleRouteError(cause)
    }
  },
)
