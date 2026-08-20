/**
 * Image Proxy Server Route
 *
 * Proxies external images (avatars, etc.) through our edge.
 * Uses Cache API for edge caching (7 days TTL).
 * Validates domain allowlist, content type, and size.
 */
import { createFileRoute } from '@tanstack/react-router'
import { waitUntil } from 'cloudflare:workers'
import { z } from 'zod'

const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB

// Allowed domains: Google (incl. yt3.ggpht.com for YouTube channel avatars),
// Apple, Facebook, Microsoft avatars.
const ALLOWED_DOMAIN_PATTERN =
  /\.(googleusercontent|ggpht|apple|facebook|fbsbx|microsoft|live|githubusercontent|gravatar)\.com$/i

const imageProxyUrlSchema = z.url({
  hostname: ALLOWED_DOMAIN_PATTERN,
})
const CACHE_TTL = 7 * 24 * 60 * 60 // 7 days
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

async function fetchImage(url: string): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Porte-Image-Proxy/1.0' },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return null
    }

    const contentType = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg'

    // Validate content type
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return new Response('Invalid image format', { status: 415 })
    }

    // Check content length header
    const contentLength = response.headers.get('content-length')
    if (contentLength && Number.parseInt(contentLength) > MAX_IMAGE_SIZE) {
      return new Response('Image too large', { status: 413 })
    }

    // Read and validate actual size
    const imageBuffer = await response.arrayBuffer()
    if (imageBuffer.byteLength > MAX_IMAGE_SIZE) {
      return new Response('Image too large', { status: 413 })
    }

    return new Response(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': imageBuffer.byteLength.toString(),
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      },
    })
  } catch {
    return null
  }
}

export const Route = createFileRoute('/api/cache/images')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Get URL from query param
        const { searchParams } = new URL(request.url)
        const url = searchParams.get('url')

        if (!url) {
          return new Response('Missing url parameter', { status: 400 })
        }

        // Validate URL (format + allowed domains)
        const result = imageProxyUrlSchema.safeParse(url)
        if (!result.success) {
          return new Response('Invalid URL', { status: 400 })
        }

        const cache = await caches.open('images')

        // Check cache first
        const cached = await cache.match(request)
        if (cached) {
          return new Response(cached.body, {
            headers: {
              ...Object.fromEntries(cached.headers),
              'X-Cache': 'HIT',
            },
          })
        }

        // Cache miss - fetch image
        const response = await fetchImage(url)

        if (!response) {
          return new Response('Failed to load image', { status: 502 })
        }

        // Error responses (415, 413) - don't cache
        if (!response.ok) {
          return response
        }

        // Clone for cache (body can only be read once)
        const responseToCache = response.clone()

        // Non-blocking cache write
        waitUntil(cache.put(request, responseToCache))

        return new Response(response.body, {
          headers: {
            ...Object.fromEntries(response.headers),
            'X-Cache': 'MISS',
          },
        })
      },
    },
  },
})
