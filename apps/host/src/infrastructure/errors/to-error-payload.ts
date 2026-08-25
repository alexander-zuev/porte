import {
  createLogger,
  InternalServerError,
  isClassifiedError,
  isDomainError,
  ServiceUnavailableError,
  type DomainError,
  type PorteErrorPayload,
} from '@porte/core/client'

const logger = createLogger('error-boundary')

/** Convert one Host failure into the contract a JSON-RPC client may see. Logs once. */
export function toErrorPayload(cause: unknown): PorteErrorPayload {
  const mapped = mapHostFailure(cause)
  if (mapped !== undefined) return serializeDomainError(mapped)
  return serializeUnknownFailure(cause)
}

function mapHostFailure(cause: unknown): DomainError | undefined {
  return isDomainError(cause) ? cause : undefined
}

function serializeDomainError(failure: DomainError): PorteErrorPayload {
  logger.warn('handled_domain_error', { error: failure, details: { tag: failure._tag } })
  return failure._tag === 'ValidationError'
    ? { _tag: failure._tag, message: failure.message, issues: [...failure.issues] }
    : { _tag: failure._tag, message: failure.message }
}

function serializeUnknownFailure(cause: unknown): PorteErrorPayload {
  const classification = isClassifiedError(cause) ? cause.classification : 'unknown'
  logger.error('unexpected_error', { error: cause, details: { classification } })
  const replacement =
    classification === 'transient' ? new ServiceUnavailableError() : new InternalServerError()
  return { _tag: replacement._tag, message: replacement.message }
}
