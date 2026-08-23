import { z } from 'zod'

const ALLOWED_IMAGE_HOST =
  /\.(googleusercontent|ggpht|apple|facebook|fbsbx|microsoft|live|githubusercontent|gravatar)\.com$/i

/** The machine request accepted by the public image proxy route. */
export const imageProxyQuerySchema = z.object({
  url: z.url({ hostname: ALLOWED_IMAGE_HOST }),
})

/** A parsed request for one approved external image URL. */
export type ImageQuery = z.infer<typeof imageProxyQuerySchema>

/** Builds the public image-proxy URL used by browser clients. */
export function buildImageProxyUrl(baseUrl: string, externalUrl: string | null): string | null {
  if (!externalUrl) return null
  const params = new URLSearchParams({ url: externalUrl })
  return `${baseUrl}/api/cache/images?${params.toString()}`
}
