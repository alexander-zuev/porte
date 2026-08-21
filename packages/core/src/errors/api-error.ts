import { TaggedError, type AnyTaggedError } from 'better-result'
import { z } from 'zod'

import { AUTHENTICATION_ERROR, NOT_AUTHORIZED_ERROR, STALE_SESSION_ERROR } from './auth.errors.ts'
import {
  CONVERSATION_BUSY_ERROR,
  CONVERSATION_NOT_FOUND_ERROR,
  PERMISSION_NOT_FOUND_ERROR,
  TURN_NOT_FOUND_ERROR,
} from './conversation.errors.ts'
import { GROK_UNAVAILABLE_ERROR } from './grok.errors.ts'
import {
  HOST_ALREADY_PAIRED_ERROR,
  HOST_OFFLINE_ERROR,
  WORKSPACE_NOT_ALLOWED_ERROR,
} from './host.errors.ts'
import { INTERNAL_SERVER_ERROR, SERVICE_UNAVAILABLE_ERROR } from './internal.errors.ts'
import { PAIRING_EXPIRED_ERROR, PAIRING_NOT_FOUND_ERROR } from './pairing.errors.ts'
import {
  RATE_LIMITED_ERROR,
  REQUEST_TIMEOUT_ERROR,
  UPGRADE_REQUIRED_ERROR,
  VALIDATION_ERROR,
  ValidationIssueSchema,
  type ValidationIssue,
} from './request.errors.ts'

/**
 * Every failure a client may be told about, and the status it answers with.
 *
 * Membership is the definition: a failure tagged with one of these crosses with
 * its meaning intact, and the boundary collapses everything else. Application
 * and infrastructure failures are absent by that same rule.
 *
 * This table is the only list of them. The tag type, the schema, and the status
 * all read from it, so none can drift from another.
 */
const API_ERRORS = {
  [VALIDATION_ERROR]: 400,
  [UPGRADE_REQUIRED_ERROR]: 426,
  [RATE_LIMITED_ERROR]: 429,
  [AUTHENTICATION_ERROR]: 401,
  [STALE_SESSION_ERROR]: 401,
  [NOT_AUTHORIZED_ERROR]: 403,
  [HOST_OFFLINE_ERROR]: 503,
  [HOST_ALREADY_PAIRED_ERROR]: 409,
  [WORKSPACE_NOT_ALLOWED_ERROR]: 403,
  [PAIRING_NOT_FOUND_ERROR]: 404,
  [PAIRING_EXPIRED_ERROR]: 410,
  [CONVERSATION_NOT_FOUND_ERROR]: 404,
  [CONVERSATION_BUSY_ERROR]: 409,
  [TURN_NOT_FOUND_ERROR]: 404,
  [PERMISSION_NOT_FOUND_ERROR]: 404,
  [GROK_UNAVAILABLE_ERROR]: 503,
  [REQUEST_TIMEOUT_ERROR]: 504,
  [SERVICE_UNAVAILABLE_ERROR]: 503,
  [INTERNAL_SERVER_ERROR]: 500,
} as const

export type ApiErrorTag = keyof typeof API_ERRORS

/**
 * A tagged failure the table names, and so one a client may be told about.
 *
 * Two branches for the same reason the wire has two: the validation failure
 * carries the fields it found wrong, and every other one is its tag alone.
 */
export type DomainError =
  | (AnyTaggedError & { _tag: Exclude<ApiErrorTag, typeof VALIDATION_ERROR> })
  | (AnyTaggedError & { _tag: typeof VALIDATION_ERROR; issues: readonly ValidationIssue[] })

export function httpStatusForApiError(tag: ApiErrorTag): number {
  return API_ERRORS[tag]
}

export function isDomainError(cause: unknown): cause is DomainError {
  return TaggedError.is(cause) && Object.hasOwn(API_ERRORS, cause._tag)
}

/**
 * The same tags, in the shape zod discriminates on.
 *
 * SAFETY: `Object.keys` returns exactly this table's keys. TypeScript widens
 * them to `string` and cannot see the table is non-empty; the assertion
 * restores only what it lost.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Recovering literal keys the compiler widened.
const API_ERROR_TAGS = Object.keys(API_ERRORS) as [ApiErrorTag, ...ApiErrorTag[]]

const ApiErrorTagSchema = z.enum(API_ERROR_TAGS)

/**
 * One failure, as any client may see it.
 *
 * The tag is the whole meaning, and the status is looked up from it rather than
 * sent beside it. `ValidationError` is the one failure carrying more, because
 * its issues name fields a person can correct.
 */
export const ApiErrorSchema = z.discriminatedUnion('_tag', [
  z.object({
    _tag: z.literal(VALIDATION_ERROR),
    message: z.string(),
    issues: z.array(ValidationIssueSchema),
  }),
  z.object({
    _tag: ApiErrorTagSchema.exclude([VALIDATION_ERROR]),
    message: z.string(),
  }),
])
export type ApiError = z.infer<typeof ApiErrorSchema>
