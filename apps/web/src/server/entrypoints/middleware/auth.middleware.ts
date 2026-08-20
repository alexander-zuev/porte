import { UserIdSchema } from '@porte/core'
import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getSessionCookie } from 'better-auth/cookies'

import { AuthenticationError } from '../../errors/authentication.error.ts'
import { StaleSessionError } from '../../errors/stale-session.error.ts'
import type { AppDeps, AuthInstance } from '../../infrastructure/app-deps.ts'

type ResolvedSession = NonNullable<Awaited<ReturnType<AuthInstance['api']['getSession']>>>

/**
 * Resolve the account behind a request, or refuse.
 *
 * A presented-but-dead cookie is reported apart from no cookie at all, so the
 * client can say the session expired rather than that the person is a stranger.
 */
async function resolveRequiredSession(deps: AppDeps): Promise<ResolvedSession> {
  const headers = getRequestHeaders()
  const result = await deps.auth().api.getSession({ headers })
  if (result) return result

  if (getSessionCookie(headers)) throw new StaleSessionError()
  throw new AuthenticationError()
}

/**
 * The account, ready to hand to a handler.
 *
 * Better Auth reports `user.id` as a bare string, so the branded id is parsed
 * here, at the boundary it arrives through, and no handler re-derives it.
 */
async function resolveAccount(deps: AppDeps) {
  const { user, session } = await resolveRequiredSession(deps)

  return { user, session, userId: UserIdSchema.parse(user.id) }
}

/**
 * Require an account, and hand its identity to the handler.
 *
 * Attach with `.middleware([requireAuth])`.
 */
export const requireAuth = createMiddleware({ type: 'function' }).server(
  async ({ next, context }) => next({ context: await resolveAccount(context.deps) }),
)

/**
 * The same requirement, for an API route.
 *
 * Two adapters, one resolution. Route middleware and server function
 * middleware are separate kinds in TanStack, so neither can attach where the
 * other does, but both go through the same two functions above.
 */
export const requireAuthRequest = createMiddleware({ type: 'request' }).server(
  async ({ next, context }) => next({ context: await resolveAccount(context.deps) }),
)
