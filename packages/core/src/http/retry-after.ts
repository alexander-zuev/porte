import { z } from 'zod'

/**
 * Canonical `Retry-After` delay seconds with no sign, decimal, or leading zero.
 * @example "30"
 * @see https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3
 */
export const RetryAfterHeaderSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)$/, { error: 'Retry-After must be canonical delay seconds' })
  .brand<'RetryAfterHeader'>()

/** A parsed `Retry-After` header in canonical delay-seconds form. */
export type RetryAfterHeader = z.infer<typeof RetryAfterHeaderSchema>
