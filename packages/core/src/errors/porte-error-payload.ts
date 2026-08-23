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
import { OPERATION_CONFLICT_ERROR, OPERATION_EXPIRED_ERROR } from './relay.errors.ts'
import {
  RATE_LIMITED_ERROR,
  REQUEST_TIMEOUT_ERROR,
  UPGRADE_REQUIRED_ERROR,
  VALIDATION_ERROR,
  ValidationIssueSchema,
  type ValidationIssue,
} from './request.errors.ts'

/**
 * Every failure an RPC or WebSocket client may be told about.
 *
 * Membership is the definition: a failure tagged with one of these crosses with
 * its meaning intact, and the boundary collapses everything else. Application
 * and infrastructure failures are absent by that same rule.
 *
 * This table is the only list of them. The tag type, the schema, and the status
 * all read from it, so none can drift from another.
 */
const DOMAIN_ERROR_TAGS = {
  [VALIDATION_ERROR]: true,
  [UPGRADE_REQUIRED_ERROR]: true,
  [RATE_LIMITED_ERROR]: true,
  [AUTHENTICATION_ERROR]: true,
  [STALE_SESSION_ERROR]: true,
  [NOT_AUTHORIZED_ERROR]: true,
  [HOST_OFFLINE_ERROR]: true,
  [HOST_ALREADY_PAIRED_ERROR]: true,
  [WORKSPACE_NOT_ALLOWED_ERROR]: true,
  [PAIRING_NOT_FOUND_ERROR]: true,
  [PAIRING_EXPIRED_ERROR]: true,
  [CONVERSATION_NOT_FOUND_ERROR]: true,
  [CONVERSATION_BUSY_ERROR]: true,
  [OPERATION_CONFLICT_ERROR]: true,
  [OPERATION_EXPIRED_ERROR]: true,
  [TURN_NOT_FOUND_ERROR]: true,
  [PERMISSION_NOT_FOUND_ERROR]: true,
  [GROK_UNAVAILABLE_ERROR]: true,
  [REQUEST_TIMEOUT_ERROR]: true,
  [SERVICE_UNAVAILABLE_ERROR]: true,
  [INTERNAL_SERVER_ERROR]: true,
} as const

export type DomainErrorTag = keyof typeof DOMAIN_ERROR_TAGS

/**
 * A tagged failure the table names, and so one a client may be told about.
 *
 * Two branches for the same reason the wire has two: the validation failure
 * carries the fields it found wrong, and every other one is its tag alone.
 */
export type DomainError =
  | (AnyTaggedError & { _tag: Exclude<DomainErrorTag, typeof VALIDATION_ERROR> })
  | (AnyTaggedError & { _tag: typeof VALIDATION_ERROR; issues: readonly ValidationIssue[] })

export function isDomainError(cause: unknown): cause is DomainError {
  return TaggedError.is(cause) && Object.hasOwn(DOMAIN_ERROR_TAGS, cause._tag)
}

/**
 * The same tags, in the shape zod discriminates on.
 *
 * SAFETY: `Object.keys` returns exactly this table's keys. TypeScript widens
 * them to `string` and cannot see the table is non-empty; the assertion
 * restores only what it lost.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Recovering literal keys the compiler widened.
const DOMAIN_ERROR_TAG_VALUES = Object.keys(DOMAIN_ERROR_TAGS) as [
  DomainErrorTag,
  ...DomainErrorTag[],
]

const DomainErrorTagSchema = z.enum(DOMAIN_ERROR_TAG_VALUES)

/**
 * One failure, as any client may see it.
 *
 * The tag is the whole meaning, and the status is looked up from it rather than
 * sent beside it. `ValidationError` is the one failure carrying more, because
 * its issues name fields a person can correct.
 */
export const PorteErrorPayloadSchema = z.discriminatedUnion('_tag', [
  z.strictObject({
    _tag: z.literal(VALIDATION_ERROR),
    message: z.string(),
    issues: z.array(ValidationIssueSchema),
  }),
  z.strictObject({
    _tag: DomainErrorTagSchema.exclude([VALIDATION_ERROR]),
    message: z.string(),
  }),
])
export type PorteErrorPayload = z.infer<typeof PorteErrorPayloadSchema>
