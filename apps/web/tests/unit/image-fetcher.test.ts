import { describe, expect, it } from 'vitest'

import {
  UpstreamRequestError,
  UpstreamTimeoutError,
} from '../../src/server/infrastructure/http/upstream-request.errors.ts'
import {
  ImageFetcher,
  InvalidImageResponseError,
} from '../../src/server/infrastructure/images/image-fetcher.ts'

describe('ImageFetcher', () => {
  it('returns one validated image', async () => {
    const fetcher = new ImageFetcher(async () =>
      Response.json([1, 2, 3], { headers: { 'Content-Type': 'image/png' } }),
    )
    const result = await fetcher.fetch('https://images.example/avatar.png')

    expect(result.isOk()).toBe(true)
    if (result.isErr()) return
    expect(result.value.contentType).toBe('image/png')
  })

  it('returns a generic error for an unsuccessful request', async () => {
    const fetcher = new ImageFetcher(async () => new Response(null, { status: 503 }))
    const result = await fetcher.fetch('https://images.example/avatar.png')

    expect(result.isErr()).toBe(true)
    if (result.isOk()) return
    expect(result.error).toBeInstanceOf(UpstreamRequestError)
  })

  it('returns an image error for unsupported content', async () => {
    const fetcher = new ImageFetcher(async () =>
      Response.json({}, { headers: { 'Content-Type': 'application/pdf' } }),
    )
    const result = await fetcher.fetch('https://images.example/avatar.pdf')

    expect(result.isErr()).toBe(true)
    if (result.isOk()) return
    expect(result.error).toBeInstanceOf(InvalidImageResponseError)
  })

  it('stops a chunked response above the image size limit', async () => {
    const body = new Uint8Array(2 * 1024 * 1024 + 1)
    const fetcher = new ImageFetcher(
      async () => new Response(body, { headers: { 'Content-Type': 'image/png' } }),
    )
    const result = await fetcher.fetch('https://images.example/avatar.png')

    expect(result.isErr()).toBe(true)
    if (result.isOk()) return
    expect(result.error).toBeInstanceOf(InvalidImageResponseError)
  })

  it('returns a timeout error for an aborted request', async () => {
    const fetcher = new ImageFetcher(async () => {
      throw new DOMException('Timed out', 'AbortError')
    })
    const result = await fetcher.fetch('https://images.example/avatar.png')

    expect(result.isErr()).toBe(true)
    if (result.isOk()) return
    expect(result.error).toBeInstanceOf(UpstreamTimeoutError)
  })
})
