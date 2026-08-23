import { RetryAfterHeaderSchema, ValidationProblemDetailsSchema } from '@porte/core'
import { describe, expect, it } from 'vitest'

describe('HTTP protocol', () => {
  it('parses a validation problem', () => {
    const problem = {
      type: 'https://useporte.dev/problems/validation',
      title: 'Request content is invalid',
      errors: [{ detail: 'Must be positive.', pointer: '#/age' }],
    }

    expect(ValidationProblemDetailsSchema.parse(problem)).toEqual(problem)
  })

  it.each(['0', '1', '30'])('accepts Retry-After value %s', (value) => {
    expect(RetryAfterHeaderSchema.parse(value)).toBe(value)
  })

  it.each(['', '-1', '+1', '1.5', '01', ' 1'])('rejects Retry-After value %s', (value) => {
    expect(RetryAfterHeaderSchema.safeParse(value).success).toBe(false)
  })
})
