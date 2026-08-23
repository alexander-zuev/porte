import { TaggedError } from 'better-result'

import { UpstreamRequestError, UpstreamTimeoutError } from '../http/upstream-request.errors.ts'

const MAX_IMAGE_SIZE = 2 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 10_000

/** A media type that the image proxy can return. */
export type ImageContentType = 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'

/** One fetched image, independent of the inbound HTTP response and edge cache. */
export type FetchedImage = {
  readonly body: ArrayBuffer
  readonly contentType: ImageContentType
}

/** The image-specific reason an upstream response cannot be used. */
export type InvalidImageResponseReason =
  | { readonly type: 'unsupported-content-type'; readonly contentType: string }
  | { readonly type: 'too-large'; readonly size: number }

/** An upstream response cannot be used as a cached image. */
export class InvalidImageResponseError extends TaggedError('InvalidImageResponseError')<{
  reason: InvalidImageResponseReason
  message: string
  classification: 'terminal'
}> {
  constructor(reason: InvalidImageResponseReason) {
    super({
      reason,
      message: 'The upstream service returned an invalid image',
      classification: 'terminal',
    })
  }
}

/** Fetch and validate images from external HTTP services. */
export class ImageFetcher {
  /** Fetch one image without exposing HTTP response or cache details. */
  async fetch(url: string): Promise<FetchedImage> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Porte-Image-Proxy/1.0' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) throw new UpstreamRequestError({ status: response.status })

      const rawContentType = response.headers.get('content-type') ?? ''
      const contentType = parseImageContentType(rawContentType)
      if (contentType === null) {
        throw new InvalidImageResponseError({
          type: 'unsupported-content-type',
          contentType: rawContentType,
        })
      }

      rejectLargeContentLength(response.headers.get('content-length'))
      return { body: await readBoundedBody(response), contentType }
    } catch (cause) {
      throw classifyRequestFailure(cause)
    }
  }
}

function classifyRequestFailure(cause: unknown) {
  if (cause instanceof InvalidImageResponseError || cause instanceof UpstreamRequestError) {
    return cause
  }
  if (
    cause instanceof DOMException &&
    (cause.name === 'AbortError' || cause.name === 'TimeoutError')
  ) {
    return new UpstreamTimeoutError(cause)
  }
  return new UpstreamRequestError(cause)
}

async function readBoundedBody(response: Response): Promise<ArrayBuffer> {
  if (response.body === null) return new ArrayBuffer(0)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let chunk = await reader.read()
  while (!chunk.done) {
    size += chunk.value.byteLength
    if (size > MAX_IMAGE_SIZE) {
      // oxlint-disable-next-line no-await-in-loop -- Stream cancellation must follow the size check.
      await reader.cancel()
      throw new InvalidImageResponseError({ type: 'too-large', size })
    }
    chunks.push(chunk.value)
    // oxlint-disable-next-line no-await-in-loop -- Stream reads are sequential.
    chunk = await reader.read()
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const bodyChunk of chunks) {
    body.set(bodyChunk, offset)
    offset += bodyChunk.byteLength
  }
  return body.buffer
}

function rejectLargeContentLength(contentLength: string | null): void {
  if (contentLength === null) return
  const size = Number(contentLength)
  if (Number.isSafeInteger(size) && size > MAX_IMAGE_SIZE) {
    throw new InvalidImageResponseError({ type: 'too-large', size })
  }
}

function parseImageContentType(contentType: string): ImageContentType | null {
  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase()
  if (
    normalized === 'image/gif' ||
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/webp'
  ) {
    return normalized
  }
  return null
}
