import { UpgradeRequiredError } from '@porte/core/client'
import { createMiddleware } from '@tanstack/react-start'

/** Require a WebSocket upgrade before a relay handler starts. */
export const requireWebSocketUpgrade = createMiddleware({ type: 'request' }).server(
  ({ next, request }) => {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      throw new UpgradeRequiredError()
    }
    return next()
  },
)
