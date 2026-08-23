import { betterFetch, type FetchEsque } from '@better-fetch/fetch'
import { Result, TaggedError, type Result as ResultType } from 'better-result'

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

/** Every expected failure from the image fetch adapter. */
export type ImageFetchError =
  | InvalidImageResponseError
  | UpstreamRequestError
  | UpstreamTimeoutError

/** Fetch and validate images from external HTTP services. */
export class ImageFetcher {
  constructor(private readonly fetchImpl: FetchEsque = globalThis.fetch) {}

  /** Fetch one image without exposing HTTP response or cache details. */
  async fetch(url: string): Promise<ResultType<FetchedImage, ImageFetchError>> {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const requested = await Result.tryPromise({
      try: () =>
        betterFetch<Blob>(url, {
          customFetchImpl: this.fetchImpl,
          headers: { 'User-Agent': 'Porte-Image-Proxy/1.0' },
          signal,
          onResponse: async ({ response }) => {
            if (!response.ok) throw new UpstreamRequestError({ status: response.status })
            const contentType = response.headers.get('content-type') ?? ''
            if (parseImageContentType(contentType) === null) {
              throw new InvalidImageResponseError({
                type: 'unsupported-content-type',
                contentType,
              })
            }
            rejectLargeContentLength(response.headers.get('content-length'))
            const body = await readBoundedBody(response)
            return new Response(body, { headers: response.headers, status: response.status })
          },
        }),
      catch: classifyRequestFailure,
    })
    if (requested.isErr()) return Result.err(requested.error)

    const { data, error } = requested.value
    if (error !== null) return Result.err(new UpstreamRequestError(error))

    const contentType = parseImageContentType(data.type)
    if (contentType === null) {
      return Result.err(
        new InvalidImageResponseError({
          type: 'unsupported-content-type',
          contentType: data.type,
        }),
      )
    }
    if (data.size > MAX_IMAGE_SIZE) {
      return Result.err(new InvalidImageResponseError({ type: 'too-large', size: data.size }))
    }

    return Result.ok({ body: await data.arrayBuffer(), contentType })
  }
}

function classifyRequestFailure(cause: unknown): ImageFetchError {
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
      await reader.cancel()
      throw new InvalidImageResponseError({ type: 'too-large', size })
    }
    chunks.push(chunk.value)
    chunk = await reader.read()
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
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
