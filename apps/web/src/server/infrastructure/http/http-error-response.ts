import {
  AuthenticationError,
  ConversationBusyError,
  ConversationNotFoundError,
  createLogger,
  GrokUnavailableError,
  HostAlreadyPairedError,
  HostOfflineError,
  InternalServerError,
  MalformedRequestError,
  NotAuthorizedError,
  OperationConflictError,
  OperationExpiredError,
  PairingExpiredError,
  PairingNotFoundError,
  PermissionNotFoundError,
  RateLimitedError,
  RequestTimeoutError,
  ResourceNotFoundError,
  ServiceUnavailableError,
  StaleSessionError,
  TurnNotFoundError,
  UpgradeRequiredError,
  ValidationError,
  WorkspaceNotAllowedError,
  type ProblemDetails,
  type ValidationProblemDetails,
} from '@porte/core/client'
import { getReasonPhrase, StatusCodes } from 'http-status-codes'

import { InvalidImageResponseError } from '../images/image-fetcher.ts'
import { UpstreamRequestError, UpstreamTimeoutError } from './upstream-request.errors.ts'

const logger = createLogger('http-error-boundary')

/** Convert one allowlisted server error into its public HTTP response. */
export function toHttpErrorResponse(cause: unknown): Response {
  const response =
    mapKnownHttpError(cause) ?? createHttpErrorResponse(StatusCodes.INTERNAL_SERVER_ERROR)
  const details = { status: response.status, title: getReasonPhrase(response.status) }

  if (response.status >= 500) {
    logger.error('http_request_failed', { error: cause, details })
  } else {
    logger.warn('http_request_rejected', details)
  }

  return response
}

function mapKnownHttpError(cause: unknown): Response | null {
  if (cause instanceof ValidationError) return validationHttpError(cause)
  if (cause instanceof RateLimitedError) {
    return createHttpErrorResponse(StatusCodes.TOO_MANY_REQUESTS, cause.message, {
      'Retry-After': cause.retryAfter,
    })
  }
  if (cause instanceof MalformedRequestError) {
    return createHttpErrorResponse(StatusCodes.BAD_REQUEST, cause.message)
  }
  if (cause instanceof AuthenticationError) {
    return createHttpErrorResponse(StatusCodes.UNAUTHORIZED, cause.message)
  }
  if (cause instanceof StaleSessionError) {
    return createHttpErrorResponse(StatusCodes.UNAUTHORIZED, cause.message)
  }
  if (cause instanceof NotAuthorizedError) {
    return createHttpErrorResponse(StatusCodes.FORBIDDEN, cause.message)
  }
  if (cause instanceof ResourceNotFoundError) {
    return createHttpErrorResponse(StatusCodes.NOT_FOUND, cause.message)
  }
  if (cause instanceof HostOfflineError) {
    return createHttpErrorResponse(StatusCodes.SERVICE_UNAVAILABLE, cause.message)
  }
  if (cause instanceof HostAlreadyPairedError) {
    return createHttpErrorResponse(StatusCodes.CONFLICT, cause.message)
  }
  if (cause instanceof WorkspaceNotAllowedError) {
    return createHttpErrorResponse(StatusCodes.FORBIDDEN, cause.message)
  }
  if (cause instanceof PairingNotFoundError) {
    return createHttpErrorResponse(StatusCodes.NOT_FOUND, cause.message)
  }
  if (cause instanceof PairingExpiredError) {
    return createHttpErrorResponse(StatusCodes.GONE, cause.message)
  }
  if (cause instanceof ConversationNotFoundError) {
    return createHttpErrorResponse(StatusCodes.NOT_FOUND, cause.message)
  }
  if (cause instanceof ConversationBusyError) {
    return createHttpErrorResponse(StatusCodes.CONFLICT, cause.message)
  }
  if (cause instanceof OperationConflictError) {
    return createHttpErrorResponse(StatusCodes.CONFLICT, cause.message)
  }
  if (cause instanceof OperationExpiredError) {
    return createHttpErrorResponse(StatusCodes.GONE, cause.message)
  }
  if (cause instanceof TurnNotFoundError) {
    return createHttpErrorResponse(StatusCodes.NOT_FOUND, cause.message)
  }
  if (cause instanceof PermissionNotFoundError) {
    return createHttpErrorResponse(StatusCodes.NOT_FOUND, cause.message)
  }
  if (cause instanceof GrokUnavailableError) {
    return createHttpErrorResponse(StatusCodes.SERVICE_UNAVAILABLE, cause.message)
  }
  if (cause instanceof RequestTimeoutError) {
    return createHttpErrorResponse(StatusCodes.GATEWAY_TIMEOUT, cause.message)
  }
  if (cause instanceof UpstreamTimeoutError) {
    return createHttpErrorResponse(StatusCodes.GATEWAY_TIMEOUT, cause.message)
  }
  if (cause instanceof UpstreamRequestError || cause instanceof InvalidImageResponseError) {
    return createHttpErrorResponse(StatusCodes.BAD_GATEWAY, cause.message)
  }
  if (cause instanceof ServiceUnavailableError) {
    return createHttpErrorResponse(StatusCodes.SERVICE_UNAVAILABLE, cause.message)
  }
  if (cause instanceof UpgradeRequiredError) {
    return createHttpErrorResponse(StatusCodes.UPGRADE_REQUIRED, cause.message)
  }
  if (cause instanceof InternalServerError) {
    return createHttpErrorResponse(StatusCodes.INTERNAL_SERVER_ERROR, cause.message)
  }
  return null
}

function validationHttpError(cause: ValidationError): Response {
  const status = StatusCodes.UNPROCESSABLE_ENTITY
  const body: ValidationProblemDetails = {
    type: 'about:blank',
    title: getReasonPhrase(status),
    detail: cause.message,
    errors: cause.issues.map((issue) => ({
      detail: issue.message,
      pointer: jsonPointer(issue.path),
    })),
  }
  return createProblemDetailsResponse(status, body)
}

function jsonPointer(path: readonly (string | number)[]): string {
  if (path.length === 0) return '#'
  const pointer = path.map((part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1'))
  return `#/${pointer.join('/')}`
}

function createHttpErrorResponse(status: number, detail?: string, headers?: HeadersInit): Response {
  const body: ProblemDetails = { type: 'about:blank', title: getReasonPhrase(status) }
  if (detail !== undefined) body.detail = detail
  return createProblemDetailsResponse(status, body, headers)
}

function createProblemDetailsResponse(
  status: number,
  body: ProblemDetails | ValidationProblemDetails,
  responseHeaders?: HeadersInit,
): Response {
  const headers = new Headers(responseHeaders)
  headers.set('Content-Type', 'application/problem+json')
  return Response.json(body, { status, headers })
}
