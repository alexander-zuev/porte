import { imageProxyQuerySchema, MalformedRequestError } from '@porte/core/client'
import { routeErrorMiddleware } from '@server/entrypoints/middleware/error.middleware.ts'
import type { FetchedImage } from '@server/infrastructure/images/image-fetcher.ts'
import { createFileRoute } from '@tanstack/react-router'
import { waitUntil } from 'cloudflare:workers'

const CACHE_TTL = 7 * 24 * 60 * 60

/** Proxy approved external images through the edge cache. */
export const Route = createFileRoute('/api/cache/images')({
  server: {
    middleware: [routeErrorMiddleware],
    handlers: {
      GET: async ({ context, request }) => {
        const { searchParams } = new URL(request.url)
        const parsed = imageProxyQuerySchema.safeParse({ url: searchParams.get('url') })
        if (!parsed.success) {
          throw new MalformedRequestError({ cause: parsed.error })
        }

        const cache = await caches.open('images')
        const cached = await cache.match(request)
        if (cached) return withCacheStatus(cached, 'HIT')

        const fetched = await context.deps.imageFetcher.fetch(parsed.data.url)
        if (fetched.isErr()) throw fetched.error

        const response = imageResponse(fetched.value)
        waitUntil(cache.put(request, response.clone()))
        return withCacheStatus(response, 'MISS')
      },
    },
  },
})

function imageResponse(image: FetchedImage): Response {
  return new Response(image.body, {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': image.body.byteLength.toString(),
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    },
  })
}

function withCacheStatus(response: Response, status: 'HIT' | 'MISS'): Response {
  const result = new Response(response.body, response)
  result.headers.set('X-Cache', status)
  return result
}
