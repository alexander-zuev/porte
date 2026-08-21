import { UpgradeRequiredError } from '@porte/core/client'
import { createMiddleware } from '@tanstack/react-start'

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
      throw new UpgradeRequiredError()
    }

    return next()
  },
)
