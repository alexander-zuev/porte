import { z } from 'zod'

// Query params schema - validates URL with security checks
export const imageProxyQuerySchema = z.object({
  url: z.url({
    hostname: /^(?!localhost|0\.0\.0\.0|127\.|192\.168\.|10\.|172\.)/i,
  }),
})

export type ImageQuery = z.infer<typeof imageProxyQuerySchema>

/** Builds the public image-proxy URL used by browser clients. */
export function buildImageProxyUrl(baseUrl: string, externalUrl: string | null): string | null {
  if (!externalUrl) return null
  const params = new URLSearchParams({ url: externalUrl })
  return `${baseUrl}/api/cache/images?${params.toString()}`
}
