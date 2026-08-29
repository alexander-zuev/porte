import { unpairHost } from '@server/application/commands/unpair-host.command.ts'
import { requireAuthRequest } from '@server/entrypoints/middleware/auth.middleware.ts'
import { routeErrorMiddleware } from '@server/entrypoints/middleware/error.middleware.ts'
import { createFileRoute } from '@tanstack/react-router'
import { StatusCodes } from 'http-status-codes'

/**
 * Where `porte unpair` ends the pairing from the machine's side.
 *
 * Session auth, not the paired-host check: a pairing revoked from the browser
 * still answers 204 here, so the daemon can clear its credential either way.
 * The daemon reads HOST_PAIRING_PATH; the two must be changed together.
 */
export const Route = createFileRoute('/api/host/pairing')({
  server: {
    middleware: [routeErrorMiddleware, requireAuthRequest],
    handlers: {
      DELETE: async ({ context }) => {
        await unpairHost(context.deps.hosts, context.deps.hostRelay, context.user.id, new Date())
        return new Response(null, { status: StatusCodes.NO_CONTENT })
      },
    },
  },
})
