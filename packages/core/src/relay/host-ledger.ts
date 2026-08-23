import { z } from 'zod'

import type { ConversationId, EventSequence, OperationId } from '../identity/identity.ts'
import {
  ConversationIdSchema,
  EventSequenceSchema,
  OperationIdSchema,
} from '../identity/identity.ts'
import {
  HostCommandResponseSchema,
  HostCommandSchema,
  HostCommandSchemas,
  HostConversationStreamMessageSchema,
  type HostCommand,
  type HostCommandResponse,
  type HostConversationStreamMessage,
} from './protocol.ts'

type HostLedgerOperation =
  | { readonly status: 'pending'; readonly command: HostCommand; readonly createdAt: number }
  | {
      readonly status: 'completed'
      readonly command: HostCommand
      readonly response: HostCommandResponse
      readonly createdAt: number
      readonly completedAt: number
    }
  | {
      readonly status: 'expired'
      readonly command: HostCommand
      readonly response: HostCommandResponse
      readonly createdAt: number
      readonly expiredAt: number
    }

/** Durable Mac records for command deduplication and event delivery. */
export type HostLedger = {
  readonly scopeId: string
  operations: Record<OperationId, HostLedgerOperation>
  nextEventSequence: Record<ConversationId, EventSequence>
  events: Array<{ readonly message: HostConversationStreamMessage; readonly createdAt: number }>
}

const HostLedgerBaseSchema = z.object({
  scopeId: z.string().regex(/^[a-f0-9]{64}$/),
  operations: z.record(
    OperationIdSchema,
    z.discriminatedUnion('status', [
      z.object({ status: z.literal('pending'), command: HostCommandSchema, createdAt: z.number() }),
      z.object({
        status: z.literal('completed'),
        command: HostCommandSchema,
        response: HostCommandResponseSchema,
        createdAt: z.number(),
        completedAt: z.number(),
      }),
      z.object({
        status: z.literal('expired'),
        command: HostCommandSchema,
        response: HostCommandResponseSchema,
        createdAt: z.number(),
        expiredAt: z.number(),
      }),
    ]),
  ),
  nextEventSequence: z.record(ConversationIdSchema, EventSequenceSchema),
  events: z.array(
    z.object({ message: HostConversationStreamMessageSchema, createdAt: z.number() }),
  ),
})

/** Validates the method-specific result stored beside each command. */
export const HostLedgerSchema = HostLedgerBaseSchema.refine(isHostLedger, {
  error: 'Host ledger contains a result for a different command method',
})

export function createEmptyHostLedger(scopeId: string): HostLedger {
  return { scopeId, operations: {}, nextEventSequence: {}, events: [] }
}

function isHostLedger(value: z.infer<typeof HostLedgerBaseSchema>): value is HostLedger {
  for (const record of Object.values(value.operations)) {
    if (
      record.status !== 'pending' &&
      record.response.type === 'command.result' &&
      !HostCommandSchemas[record.command.method].result.safeParse(record.response.result).success
    ) {
      return false
    }
  }
  return true
}
