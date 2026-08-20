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
 * Require an account, and hand its identity to the handler.
 *
 * Attach with `.middleware([requireAuth])`. The branded id is parsed once here,
 * so no handler re-derives it from `user.id`.
 */
export const requireAuth = createMiddleware({ type: 'function' }).server(
  async ({ next, context }) => {
    const { user, session } = await resolveRequiredSession(context.deps)

    return next({ context: { user, session, userId: UserIdSchema.parse(user.id) } })
  },
)
