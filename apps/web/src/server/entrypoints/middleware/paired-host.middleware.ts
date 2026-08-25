import { NotAuthorizedError } from '@porte/core/client'
import type { AgentConnectionRole } from '@server/application/ports/agent-connection.ts'
import { createMiddleware } from '@tanstack/react-start'

import { requireAuthRequest } from './auth.middleware.ts'

/** Require an active Host pairing and add its trusted routing facts to context. */
export const requirePairedHostRequest = createMiddleware()
  .middleware([requireAuthRequest])
  .server(async ({ next, context, request }) => {
    const pairing = await context.deps.hosts.findPairing(context.user.id)
    if (pairing.state !== 'paired') throw new NotAuthorizedError()

    return next({
      context: {
        hostId: pairing.host.id,
        role: roleOf(request),
      },
    })
  })

/** Derive the connection role from the credential kind accepted by auth. */
function roleOf(request: Request): AgentConnectionRole {
  return request.headers.get('authorization') === null ? 'client' : 'daemon'
}
