import type { ApiError, ApiErrorCode } from '@porte/core'

const HTTP_STATUS_BY_CODE = {
  INVALID_REQUEST: 400,
  NOT_AUTHENTICATED: 401,
  NOT_AUTHORIZED: 403,
  HOST_OFFLINE: 503,
  WORKSPACE_NOT_ALLOWED: 403,
  SESSION_NOT_FOUND: 404,
  SESSION_BUSY: 409,
  TURN_NOT_FOUND: 404,
  PERMISSION_NOT_FOUND: 404,
  PAIRING_NOT_FOUND: 404,
  PAIRING_EXPIRED: 410,
  HOST_ALREADY_PAIRED: 409,
  RATE_LIMITED: 429,
  REQUEST_TIMEOUT: 504,
  GROK_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} satisfies Record<ApiErrorCode, number>

/** Expected API failure that the route boundary converts to an HTTP response. */
export class ApiRouteError extends Error {
  readonly error: ApiError
  readonly status: number

  constructor(input: { error: ApiError; status?: number }) {
    super(input.error.message)
    this.name = 'ApiRouteError'
    this.error = input.error
    this.status = input.status ?? HTTP_STATUS_BY_CODE[input.error.code]
  }
}
