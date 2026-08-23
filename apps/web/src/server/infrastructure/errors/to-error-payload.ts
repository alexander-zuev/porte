import {
  createLogger,
  InternalServerError,
  isClassifiedError,
  isDomainError,
  ServiceUnavailableError,
  ValidationError,
  ValidationIssueSchema,
  type PorteErrorPayload,
  type DomainError,
} from '@porte/core/client'
import { z } from 'zod'

const logger = createLogger('error-boundary')

/** Issues survive a trip through `Error.message` as JSON, which is how they arrive. */
const validationIssuesSchema = z.array(ValidationIssueSchema).min(1)

/** Reconstruct validation issues serialized into `Error.message` by TanStack or Zod. */
function reconstructValidationError(cause: unknown): ValidationError | null {
  if (!(cause instanceof Error)) return null

  let message: unknown
  try {
    message = JSON.parse(cause.message)
  } catch {
    return null
  }

  const parsed = validationIssuesSchema.safeParse(message)
  if (!parsed.success) return null
  return new ValidationError(parsed.data)
}

/** A failure the table names crosses with its own tag and message. */
function serializeDomainError(failure: DomainError): PorteErrorPayload {
  logger.warn('handled_domain_error', { error: failure, details: { tag: failure._tag } })

  return failure._tag === 'ValidationError'
    ? { _tag: failure._tag, message: failure.message, issues: [...failure.issues] }
    : { _tag: failure._tag, message: failure.message }
}

/**
 * Every other failure crosses as a generic one that says nothing about us.
 *
 * A failure that said it was temporary answers 503, so a caller learns whether
 * coming back is worth it. One that says nothing was never wrapped by the
 * boundary it came from, and is unknown by that fact alone.
 */
function serializeUnknownFailure(cause: unknown): PorteErrorPayload {
  const classification = isClassifiedError(cause) ? cause.classification : 'unknown'
  logger.error('unexpected_error', { error: cause, details: { classification } })

  const replacement =
    classification === 'transient' ? new ServiceUnavailableError() : new InternalServerError()
  return { _tag: replacement._tag, message: replacement.message }
}

/** Convert an unknown server throw into the contract a client may see. Logs once. */
export function toErrorPayload(cause: unknown): PorteErrorPayload {
  const failure = reconstructValidationError(cause) ?? cause

  return isDomainError(failure) ? serializeDomainError(failure) : serializeUnknownFailure(failure)
}
