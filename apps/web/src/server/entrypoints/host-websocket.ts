import { ApiErrorSchema, type ApiError } from '@lras/core'
import { z } from 'zod'

import { connectHost } from '../application/handlers/connect-host'
import type { AppDeps } from '../infrastructure/app-deps'

const bearerSchema = z.string().regex(/^Bearer\s+(.+)$/i)

/** Authenticate and route the public host WebSocket upgrade. */
export async function hostWebSocket(request: Request, deps: AppDeps): Promise<Response> {
  if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return apiErrorResponse({ code: 'INVALID_REQUEST', message: 'WebSocket upgrade required' }, 426)
  }

  const authenticated = await deps.hostAuthenticator.authenticate(bearerCredential(request))
  if (!authenticated.success) {
    const status = authenticated.error.code === 'NOT_AUTHENTICATED' ? 401 : 500
    return apiErrorResponse(authenticated.error, status)
  }

  return connectHost(
    {
      hostId: authenticated.data.hostId,
      role: authenticated.data.role,
      request,
    },
    deps,
  )
}

function bearerCredential(request: Request): string | undefined {
  const parsed = bearerSchema.safeParse(request.headers.get('authorization'))
  return parsed.success ? parsed.data.replace(/^Bearer\s+/i, '') : undefined
}

function apiErrorResponse(error: ApiError, status: number): Response {
  const safeError = ApiErrorSchema.parse(error)
  return Response.json({ success: false, error: safeError }, { status })
}
