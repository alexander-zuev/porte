import { z } from 'zod'

import { CanonicalContentSchema } from '../conversation/canonical-content.ts'
import { ConversationEventSchema } from '../conversation/conversation-event.ts'
import {
  ConversationTranscriptSchema,
  ReadConversationSchema,
} from '../conversation/conversation-transcript.ts'
import { ConversationStateSnapshotSchema } from '../conversation/conversation-view.ts'
import { ConversationsSchema, ConversationSummarySchema } from '../conversation/conversation.ts'
import { PorteErrorPayloadSchema } from '../errors/porte-error-payload.ts'
import {
  ConversationIdSchema,
  EventSequenceSchema,
  MessageIdSchema,
  OperationIdSchema,
  PermissionIdSchema,
  TurnIdSchema,
} from '../identity/identity.ts'

export * from './host-methods.ts'

// TEMPORARY: Keep the old relay protocol until the Host JSON-RPC refactor resumes.
const EmptyPayloadSchema = z.object({})

/**
 * Each host command has one operation identifier and one typed result.
 * The host opens a conversation when a turn starts.
 */
export const HostCommandSchemas = {
  'conversations.sync': {
    params: EmptyPayloadSchema,
    // The event heads let the relay restore its position after a new Host ledger.
    result: z.object({ eventHeads: z.record(ConversationIdSchema, EventSequenceSchema) }),
  },
  'conversation.read': {
    params: ReadConversationSchema,
    result: ConversationTranscriptSchema,
  },
  'conversation.create': {
    params: z.object({ cwd: z.string().min(1) }),
    result: z.object({ conversation: ConversationSummarySchema }),
  },
  'turn.start': {
    params: z.object({
      conversationId: ConversationIdSchema,
      turnId: TurnIdSchema,
      userMessage: z.object({
        id: MessageIdSchema,
        content: z.array(CanonicalContentSchema).min(1),
      }),
    }),
    result: z.object({ turnId: TurnIdSchema }),
  },
  'turn.cancel': {
    params: z.object({ conversationId: ConversationIdSchema, turnId: TurnIdSchema }),
    result: z.object({ turnId: TurnIdSchema }),
  },
  'permission.answer': {
    params: z.object({
      conversationId: ConversationIdSchema,
      turnId: TurnIdSchema,
      permissionId: PermissionIdSchema,
      optionId: z.string().min(1),
    }),
    result: z.object({ permissionId: PermissionIdSchema }),
  },
} as const

export type HostCommandMethod = keyof typeof HostCommandSchemas
export type HostCommandMap = {
  [Method in HostCommandMethod]: {
    params: z.infer<(typeof HostCommandSchemas)[Method]['params']>
    result: z.infer<(typeof HostCommandSchemas)[Method]['result']>
  }
}

export type HostCommand<Method extends HostCommandMethod = HostCommandMethod> =
  Method extends HostCommandMethod
    ? {
        v: 2
        type: 'command'
        operationId: z.infer<typeof OperationIdSchema>
        method: Method
        params: HostCommandMap[Method]['params']
      }
    : never

/** Input for one host command before the relay adds its wire constants. */
export type HostCommandInput<Method extends HostCommandMethod = HostCommandMethod> =
  Method extends 'conversations.sync'
    ? Pick<HostCommand<Method>, 'operationId' | 'method'>
    : Omit<HostCommand<Method>, 'v' | 'type'>

/** Adds relay-owned wire fields and the empty catalog-sync payload. */
export function createHostCommand(input: HostCommandInput): HostCommand {
  if (input.method === 'conversations.sync') {
    return { v: 2, type: 'command', ...input, params: {} }
  }

  return { v: 2, type: 'command', ...input }
}

/** Derives the start command key from the conversation and client turn identifiers. */
export function turnStartOperationId(
  conversationId: z.infer<typeof ConversationIdSchema>,
  turnId: z.infer<typeof TurnIdSchema>,
): z.infer<typeof OperationIdSchema> {
  return OperationIdSchema.parse(
    `turn:${String(conversationId.length)}:${conversationId}:${turnId}`,
  )
}

/** Derives the cancel command key from the conversation and client turn identifiers. */
export function turnCancelOperationId(
  conversationId: z.infer<typeof ConversationIdSchema>,
  turnId: z.infer<typeof TurnIdSchema>,
): z.infer<typeof OperationIdSchema> {
  return OperationIdSchema.parse(
    `cancel:${String(conversationId.length)}:${conversationId}:${turnId}`,
  )
}

function createHostCommandSchema<Method extends HostCommandMethod, Params extends z.ZodType>(
  method: Method,
  params: Params,
) {
  return z.object({
    v: z.literal(2),
    type: z.literal('command'),
    operationId: OperationIdSchema,
    method: z.literal(method),
    params,
  })
}

export const HostCommandSchema = z.discriminatedUnion('method', [
  createHostCommandSchema('conversations.sync', HostCommandSchemas['conversations.sync'].params),
  createHostCommandSchema('conversation.read', HostCommandSchemas['conversation.read'].params),
  createHostCommandSchema('conversation.create', HostCommandSchemas['conversation.create'].params),
  createHostCommandSchema('turn.start', HostCommandSchemas['turn.start'].params),
  createHostCommandSchema('turn.cancel', HostCommandSchemas['turn.cancel'].params),
  createHostCommandSchema('permission.answer', HostCommandSchemas['permission.answer'].params),
])

export type HostCommandResult<Method extends HostCommandMethod = HostCommandMethod> = {
  v: 2
  type: 'command.result'
  operationId: z.infer<typeof OperationIdSchema>
  result: HostCommandMap[Method]['result']
}

export type HostCommandResponse<Method extends HostCommandMethod = HostCommandMethod> =
  | HostCommandResult<Method>
  | HostCommandError

export const HostCommandResultSchema = z.object({
  v: z.literal(2),
  type: z.literal('command.result'),
  operationId: OperationIdSchema,
  result: z.unknown(),
})

export const HostCommandErrorSchema = z.object({
  v: z.literal(2),
  type: z.literal('command.error'),
  operationId: OperationIdSchema,
  error: PorteErrorPayloadSchema,
})
export type HostCommandError = z.infer<typeof HostCommandErrorSchema>

export const HostCommandResponseSchema = z.union([HostCommandResultSchema, HostCommandErrorSchema])

export const HostEventAckSchema = z.object({
  v: z.literal(2),
  type: z.literal('event.ack'),
  conversationId: ConversationIdSchema,
  throughEventSequence: EventSequenceSchema,
})
export type HostEventAck = z.infer<typeof HostEventAckSchema>

export const HostConversationEventSchema = z.object({
  v: z.literal(2),
  type: z.literal('conversation.event'),
  conversationId: ConversationIdSchema,
  eventSequence: EventSequenceSchema,
  event: ConversationEventSchema,
})
export type HostConversationEvent = z.infer<typeof HostConversationEventSchema>

export const HostConversationSnapshotSchema = z.object({
  v: z.literal(2),
  type: z.literal('conversation.snapshot'),
  conversationId: ConversationIdSchema,
  throughEventSequence: EventSequenceSchema,
  snapshot: ConversationStateSnapshotSchema,
})
export type HostConversationSnapshot = z.infer<typeof HostConversationSnapshotSchema>

/** One ordered event or state checkpoint sent by the host. */
export const HostConversationStreamMessageSchema = z.union([
  HostConversationEventSchema,
  HostConversationSnapshotSchema,
])
export type HostConversationStreamMessage = z.infer<typeof HostConversationStreamMessageSchema>

export const ActiveConversationTurnSchema = z.object({
  conversationId: ConversationIdSchema,
  turnId: TurnIdSchema,
})
export type ActiveConversationTurn = z.infer<typeof ActiveConversationTurnSchema>

const HostConversationSyncMessageSchema = z.discriminatedUnion('done', [
  z.object({
    v: z.literal(2),
    type: z.literal('conversations.sync'),
    operationId: OperationIdSchema,
    conversations: ConversationsSchema,
    done: z.literal(false),
  }),
  z.object({
    v: z.literal(2),
    type: z.literal('conversations.sync'),
    operationId: OperationIdSchema,
    conversations: ConversationsSchema,
    done: z.literal(true),
    activeTurns: z.array(ActiveConversationTurnSchema),
  }),
])
export type HostConversationSyncMessage = z.infer<typeof HostConversationSyncMessageSchema>

export const HostConversationListMessageSchema = z.union([
  HostConversationSyncMessageSchema,
  z.object({
    v: z.literal(2),
    type: z.literal('conversation.summary'),
    conversation: ConversationSummarySchema,
  }),
  z.object({
    v: z.literal(2),
    type: z.literal('conversation.removed'),
    conversationId: ConversationIdSchema,
  }),
])
export type HostConversationListMessage = z.infer<typeof HostConversationListMessageSchema>

/** Messages that the relay sends through its single host WebSocket. */
export const RelayToHostMessageSchema = z.union([HostCommandSchema, HostEventAckSchema])
export type RelayToHostMessage = z.infer<typeof RelayToHostMessageSchema>

/** Messages that the Mac sends through its single relay WebSocket. */
export const HostToRelayMessageSchema = z.union([
  HostCommandResultSchema,
  HostCommandErrorSchema,
  HostConversationStreamMessageSchema,
  HostConversationListMessageSchema,
])
export type HostToRelayMessage = z.infer<typeof HostToRelayMessageSchema>
