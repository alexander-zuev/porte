import { connectHost } from '../application/commands/connect-host.command.ts'
import { AuthenticationError } from '../errors/authentication.error.ts'
import { StaleSessionError } from '../errors/stale-session.error.ts'
import type { AppDeps } from '../infrastructure/app-deps.ts'
import { resolveAccount } from './middleware/auth.middleware.ts'
import { apiErrorResponse } from './middleware/error.middleware.ts'

/** Where a daemon and a browser both reach the relay. */
export const RELAY_PATH = '/api/host/ws'

/**
 * Whether this request is the relay handshake.
 *
 * Answered before the router sees it, because a `101` carries immutable headers
 * and the router merges its own into every response it returns. That merge
 * throws, so an upgrade cannot survive a route handler at all.
 */
export function isRelayUpgrade(request: Request): boolean {
  return (
    new URL(request.url).pathname === RELAY_PATH &&
    request.headers.get('upgrade')?.toLowerCase() === 'websocket'
  )
}

/**
 * Join the caller to the relay that serves their Mac.
 *
 * Reads the request, calls one command, and maps the answer. An API caller is a
 * program, so a refusal is a status it can read and never a redirect.
 */
export async function handleRelayUpgrade(request: Request, deps: AppDeps): Promise<Response> {
  let userId
  try {
    ;({ userId } = await resolveAccount(deps, request.headers))
  } catch (cause) {
    if (cause instanceof AuthenticationError || cause instanceof StaleSessionError) {
      return apiErrorResponse({ code: 'NOT_AUTHENTICATED', message: cause.message }, 401)
    }
    throw cause
  }

  const connected = await connectHost(deps.hosts, deps.hostRelay, { userId, request })
  if (connected.ok) return connected.response

  return apiErrorResponse(
    {
      code: 'NOT_AUTHORIZED',
      message:
        connected.reason === 'unpaired'
          ? 'This account has no paired Mac'
          : 'This pairing was revoked',
    },
    403,
  )
}
