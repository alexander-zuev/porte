import {
  PorteErrorPayloadSchema,
  InternalServerError,
  type PorteErrorPayload,
  type DomainErrorTag,
} from '@porte/core/client'

/**
 * The tag a rejected server function carried, or none.
 *
 * None means the request never reached the Worker — no network, a refused
 * request — because the boundary tags everything it produces. A decision needs
 * to tell those apart, so this says so rather than inventing a tag.
 */
export function errorPayloadTagOf(cause: unknown): DomainErrorTag | null {
  const parsed = PorteErrorPayloadSchema.safeParse(cause)
  return parsed.success ? parsed.data._tag : null
}

/**
 * The same failure, as something to show a person.
 *
 * Here an untagged failure becomes the generic one, because a screen has to say
 * something either way. Only display should use this: a decision that blanks an
 * unreached request loses the one fact that made it worth retrying.
 */
export function readErrorPayload(cause: unknown): PorteErrorPayload {
  const parsed = PorteErrorPayloadSchema.safeParse(cause)
  if (parsed.success) return parsed.data

  const unreached = new InternalServerError()
  return { _tag: unreached._tag, message: unreached.message }
}
