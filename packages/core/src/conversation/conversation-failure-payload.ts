import { z } from 'zod'

import { CODING_AGENT_UNAVAILABLE_ERROR } from '../errors/coding-agent.errors.ts'
import { INTERNAL_SERVER_ERROR } from '../errors/internal.errors.ts'
import { REQUEST_TIMEOUT_ERROR } from '../errors/request.errors.ts'

/** Safe tagged failure that can cross the Porte conversation protocol. */
export const ConversationFailurePayloadSchema = z.discriminatedUnion('_tag', [
  z.strictObject({
    _tag: z.literal(CODING_AGENT_UNAVAILABLE_ERROR),
    message: z.string().min(1),
  }),
  z.strictObject({
    _tag: z.literal(REQUEST_TIMEOUT_ERROR),
    message: z.string().min(1),
  }),
  z.strictObject({
    _tag: z.literal(INTERNAL_SERVER_ERROR),
    message: z.string().min(1),
  }),
])

/** Safe tagged failure that can cross the Porte conversation protocol. */
export type ConversationFailurePayload = z.infer<typeof ConversationFailurePayloadSchema>
