import { AuthenticationError, createLogger, StaleSessionError } from '@porte/core/client'
import type { Session, SessionWithUser, User } from '@server/infrastructure/auth/auth-types.ts'
import type { PorteWorkerResources } from '@server/infrastructure/porte-worker-resources.ts'
import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getSessionCookie } from 'better-auth/cookies'

const logger = createLogger('auth-middleware')

export interface AuthContext {
  user?: User
  session?: Session
}

export interface RequiredAuthContext {
  user: User
  session: Session
}

/**
 * Shared auth resolution — called by both extractAuth and requireAuth.
 *
 * Headers are passed in rather than read here. Function and request middleware
 * obtain them from different TanStack APIs.
 */
async function resolveSession(deps: PorteWorkerResources, headers: Headers) {
  // SAFETY: `advanced.database.generateId` in options.ts mints every id as uuid
  // v7, so a resolved session carries one of ours. Better Auth types `id` as a
  // bare string and offers no way to say otherwise, so the brand is attached here.
  const result = (await deps.auth().api.getSession({ headers })) as SessionWithUser | null
  return { headers, result }
}

async function resolveRequiredSession(
  deps: PorteWorkerResources,
  requestHeaders: Headers,
): Promise<SessionWithUser> {
  const { headers, result } = await resolveSession(deps, requestHeaders)
  if (result !== null) return result

  if (getSessionCookie(headers)) throw new StaleSessionError()
  throw new AuthenticationError()
}

/**
 * Extracts auth session if present, sets context.
 * Never throws — use requireAuth for protected endpoints.
 * Server function middleware (supports .middleware() chaining).
 */
export const extractAuth = createMiddleware({ type: 'function' }).server(
  async ({ next, context }) => {
    let user: User | undefined
    let session: Session | undefined

    try {
      const { result } = await resolveSession(context.deps, getRequestHeaders())
      user = result?.user
      session = result?.session
    } catch (error) {
      logger.error('get_session_failed', { error })
    }

    if (user) context.deps.services.observability().setUser({ id: user.id })

    return next({ context: { user, session } })
  },
)

/**
 * Requires authentication — distinguishes a missing session from a presented stale session.
 * Use on server functions via .middleware([requireAuth]).
 */
export const requireAuth = createMiddleware({ type: 'function' }).server(
  async ({ next, context }) => {
    const result = await resolveRequiredSession(context.deps, getRequestHeaders())
    context.deps.services.observability().setUser({ id: result.user.id })

    return next({ context: { user: result.user, session: result.session } })
  },
)

/**
 * Requires authentication — throws if not authenticated.
 * Request middleware — works on routes, SSR, and server functions.
 * Use on TanStack Start routes via server.middleware: [requireAuthRequest].
 */
export const requireAuthRequest = createMiddleware().server(async ({ next, context, request }) => {
  const result = await resolveRequiredSession(context.deps, request.headers)

  context.deps.services.observability().setUser({ id: result.user.id })

  return next({ context: { user: result.user, session: result.session } })
})
