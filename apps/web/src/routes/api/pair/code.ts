import { DeviceCodeRequestSchema } from '@porte/core'
import {
  issuePairingCode,
  type PairingCodeRequest,
} from '@server/application/commands/issue-pairing-code.command.ts'
import { routeErrorMiddleware } from '@server/entrypoints/middleware/error.middleware.ts'
import { ApiRouteError } from '@server/errors/api-route.error.ts'
import { createFileRoute } from '@tanstack/react-router'

/**
 * Where a device asks for a pairing code.
 *
 * Ours rather than the plugin's own endpoint, because issuing a code and
 * recording what asked for it are one moment, and only a route we own has both
 * the caller's headers and the code in hand.
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
        const asked = await readRequest(request)

        const issued = await issuePairingCode(
          context.deps.pairingAuthority,
          context.deps.pairingOrigins,
          asked,
        )

        return Response.json(issued, { headers: { 'Cache-Control': 'no-store' } })
      },
    },
  },
})

/**
 * Read one HTTP request into the input the command declares.
 *
 * Route handlers have no validator of their own, unlike server functions, so
 * every check lives here and the handler above only dispatches.
 */
async function readRequest(request: Request): Promise<PairingCodeRequest> {
  // Only the CLI asks for a code, and it always names itself. An unnamed
  // machine is a malformed request, never one to invent a name for.
  const body = DeviceCodeRequestSchema.safeParse(await request.json())
  if (!body.success) {
    throw new ApiRouteError({
      error: { code: 'INVALID_REQUEST', message: 'The device must identify and name itself' },
      status: 400,
    })
  }

  return {
    clientId: body.data.client_id,
    host: { name: body.data.host_name, platform: body.data.host_platform },
    origin: {
      // Cloudflare resolves these at the edge. City needs a plan that includes
      // it, so the screen falls back to the country without it.
      ipAddress: request.headers.get('cf-connecting-ip') ?? 'an unknown address',
      country: request.headers.get('cf-ipcountry'),
      city: request.headers.get('cf-ipcity'),
    },
    requestedAt: new Date(),
  }
}
