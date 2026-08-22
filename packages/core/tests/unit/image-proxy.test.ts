import { describe, expect, it } from 'vitest'

import { buildImageProxyUrl } from '../../src/index.ts'

const avatar = 'https://lh3.googleusercontent.com/a/ACg8ocK?s=96-c'

describe('buildImageProxyUrl', () => {
  it('returns null when the account has no picture', () => {
    expect(buildImageProxyUrl('', null)).toBeNull()
  })

  it('points a relative url at the proxy route', () => {
    expect(buildImageProxyUrl('', avatar)).toBe(
      `/api/cache/images?url=${encodeURIComponent(avatar)}`,
    )
  })

  it('keeps the origin when one is given', () => {
    expect(buildImageProxyUrl('https://porte.app', avatar)).toBe(
      `https://porte.app/api/cache/images?url=${encodeURIComponent(avatar)}`,
    )
  })

  it('encodes the query string of the external url', () => {
    expect(buildImageProxyUrl('', avatar)).not.toContain('?s=96-c')
  })
})
