import { DeviceCodeRequestSchema } from '@porte/core'
import { createFileRoute } from '@tanstack/react-router'

import { issuePairingCode } from '#/server/application/commands/issue-pairing-code.command.ts'
import { ApiRouteError } from '#/server/errors/api-route.error.ts'
import { routeErrorMiddleware } from '#/server/middleware/error.middleware.ts'

/**
 * Where a device asks for a pairing code.
 *
 * Ours rather than the plugin's own endpoint, because issuing a code and
 * recording where it came from are one moment, and only a route we own has
 * both the caller's headers and the code in hand.
 *
 * The body and the response keep RFC 8628's wire names, so the daemon and the
 * specification can be read side by side.
 */
// The generator parses this id statically, so it has to be a literal. The
// daemon posts to PAIRING_CODE_PATH; the two must be changed together.
export const Route = createFileRoute('/api/pair/code')({
  server: {
    middleware: [routeErrorMiddleware],
    handlers: {
      POST: async ({ request, context }) => {
        const body = DeviceCodeRequestSchema.safeParse(await request.json())
        if (!body.success) {
          throw new ApiRouteError({
            error: { code: 'INVALID_REQUEST', message: 'client_id is required' },
            status: 400,
          })
        }

        const issued = await issuePairingCode(
          context.deps.pairingAuthority,
          context.deps.pairingOrigins,
          body.data.client_id,
          {
            // Cloudflare resolves these at the edge. City needs a plan that
            // includes it, so the screen falls back to the country without it.
            ipAddress: request.headers.get('cf-connecting-ip') ?? 'an unknown address',
            country: request.headers.get('cf-ipcountry'),
            city: request.headers.get('cf-ipcity'),
            requestedAt: new Date(),
          },
        )

        return Response.json(issued, { headers: { 'Cache-Control': 'no-store' } })
      },
    },
  },
})
