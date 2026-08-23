import {
  HostOfflineError,
  ProblemDetailsSchema,
  RateLimitedError,
  RetryAfterHeaderSchema,
  ValidationError,
  ValidationProblemDetailsSchema,
} from '@porte/core/client'
import { toHttpErrorResponse } from '@server/infrastructure/http/http-error-response.ts'
import { describe, expect, it } from 'vitest'

describe('toHttpErrorResponse', () => {
  it('maps a known error to Problem Details', async () => {
    const response = toHttpErrorResponse(new HostOfflineError())

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(ProblemDetailsSchema.parse(await response.json())).toMatchObject({
      type: 'about:blank',
      title: 'Service Unavailable',
      detail: 'Host is offline',
    })
  })

  it('maps Zod paths to JSON Pointer fragments', async () => {
    const response = toHttpErrorResponse(
      new ValidationError([{ message: 'Invalid value', path: ['profile', 'a/b'] }]),
    )

    expect(response.status).toBe(422)
    expect(ValidationProblemDetailsSchema.parse(await response.json())).toMatchObject({
      errors: [{ detail: 'Invalid value', pointer: '#/profile/a~1b' }],
    })
  })

  it('sets Retry-After for rate limits', () => {
    const response = toHttpErrorResponse(new RateLimitedError(RetryAfterHeaderSchema.parse('30')))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('30')
  })

  it('hides an unknown error', async () => {
    const response = toHttpErrorResponse(new Error('database password leaked'))

    expect(response.status).toBe(500)
    expect(ProblemDetailsSchema.parse(await response.json())).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
    })
  })
})
