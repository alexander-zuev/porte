import { UpgradeRequiredError } from '@porte/core/client'
import { createMiddleware } from '@tanstack/react-start'
import { removeResponseHeader } from '@tanstack/react-start/server'

/** Require a WebSocket upgrade before a relay handler starts. */
export const requireWebSocketUpgrade = createMiddleware({ type: 'request' }).server(
  async ({ next, request }) => {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      throw new UpgradeRequiredError()
    }

    const response = await next()
    // A 101 Response has immutable headers, so TanStack must not merge session cookies into it.
    removeResponseHeader('set-cookie')
    return response
  },
)
