import { z } from 'zod'

/**
 * The standard RFC 9457 body for a failed HTTP response.
 * The HTTP response status remains authoritative; extensions may add problem-specific data.
 * @see https://http.dev/problem-details
 */
export const ProblemDetailsSchema = z.looseObject({
  /**
   * Stable URI for the problem type; use `about:blank` when the HTTP status is sufficient.
   * @example "about:blank"
   */
  type: z.string(),
  /**
   * Stable human-readable name for the problem type.
   * @example "Service Unavailable"
   */
  title: z.string(),
  /**
   * Safe human-readable explanation for this occurrence; clients must not parse it.
   * @example "Porte is not connected on the paired Mac."
   */
  detail: z.string().optional(),
  /**
   * URI reference for this occurrence; omit it when no correlation resource exists.
   * @example "/problems/occurrences/01K5F6Y7"
   */
  instance: z.string().optional(),
})

/** An RFC 9457 problem body for a failed HTTP response. */
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>

/** One invalid value in a `422` validation problem. */
export const ValidationProblemErrorSchema = z.object({
  /**
   * Safe explanation of why this value is invalid.
   * @example "Must be a positive integer."
   */
  detail: z.string(),
  /**
   * RFC 6901 JSON Pointer fragment for the invalid value.
   * @example "#/age"
   */
  pointer: z.string().regex(/^#(?:\/(?:[^~]|~[01])*)*$/u),
})

/** One invalid value in a `422` validation problem. */
export type ValidationProblemError = z.infer<typeof ValidationProblemErrorSchema>

/** An RFC 9457 validation problem with one or more invalid content values. */
export const ValidationProblemDetailsSchema = ProblemDetailsSchema.extend({
  errors: z.array(ValidationProblemErrorSchema).min(1),
})

/** An RFC 9457 validation problem with one or more invalid content values. */
export type ValidationProblemDetails = z.infer<typeof ValidationProblemDetailsSchema>
