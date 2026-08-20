import { createMiddleware } from '@tanstack/react-start'

import { ApiRouteError } from '../../errors/api-route.error.ts'

/**
 * Refuse anything that is not asking to become a WebSocket.
 *
 * A relay route can only answer an upgrade, so a plain request is malformed
 * rather than unauthorized. Held here so a handler starts with a request it
 * can actually answer.
 */
export const requireWebSocketUpgrade = createMiddleware({ type: 'request' }).server(
  ({ next, request }) => {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      throw new ApiRouteError({
        error: { code: 'INVALID_REQUEST', message: 'WebSocket upgrade required' },
        status: 426,
      })
    }

    return next()
  },
)
