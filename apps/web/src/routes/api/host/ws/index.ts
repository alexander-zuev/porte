import { routeErrorMiddleware } from '@server/entrypoints/middleware/error.middleware.ts'
import { requirePairedHostRequest } from '@server/entrypoints/middleware/paired-host.middleware.ts'
import { requireWebSocketUpgrade } from '@server/entrypoints/middleware/websocket.middleware.ts'
import { createFileRoute } from '@tanstack/react-router'

/** Join a daemon or browser to its HostRelayAgent. */
export const Route = createFileRoute('/api/host/ws/')({
  server: {
    middleware: [routeErrorMiddleware, requireWebSocketUpgrade, requirePairedHostRequest],
    handlers: {
      GET: ({ context, request }) =>
        context.deps.hostRelay.connect({
          hostId: context.hostId,
          role: context.role,
          request,
        }),
    },
  },
})
