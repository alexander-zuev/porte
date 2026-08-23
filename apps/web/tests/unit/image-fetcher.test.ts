import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  UpstreamRequestError,
  UpstreamTimeoutError,
} from '../../src/server/infrastructure/http/upstream-request.errors.ts'
import {
  ImageFetcher,
  InvalidImageResponseError,
} from '../../src/server/infrastructure/images/image-fetcher.ts'

describe('ImageFetcher', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns one validated image', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json([1, 2, 3], { headers: { 'Content-Type': 'image/png' } }),
    )
    const image = await new ImageFetcher().fetch('https://images.example/avatar.png')

    expect(image.contentType).toBe('image/png')
  })

  it('throws a generic error for an unsuccessful request', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }))
    const request = new ImageFetcher().fetch('https://images.example/avatar.png')

    await expect(request).rejects.toBeInstanceOf(UpstreamRequestError)
  })

  it('throws an image error for unsupported content', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({}, { headers: { 'Content-Type': 'application/pdf' } }),
    )
    const request = new ImageFetcher().fetch('https://images.example/avatar.pdf')

    await expect(request).rejects.toBeInstanceOf(InvalidImageResponseError)
  })

  it('stops a chunked response above the image size limit', async () => {
    const body = new Uint8Array(2 * 1024 * 1024 + 1)
    vi.stubGlobal(
      'fetch',
      async () => new Response(body, { headers: { 'Content-Type': 'image/png' } }),
    )
    const request = new ImageFetcher().fetch('https://images.example/avatar.png')

    await expect(request).rejects.toBeInstanceOf(InvalidImageResponseError)
  })

  it('throws a timeout error for an aborted request', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('Timed out', 'AbortError')
    })
    const request = new ImageFetcher().fetch('https://images.example/avatar.png')

    await expect(request).rejects.toBeInstanceOf(UpstreamTimeoutError)
  })
})
