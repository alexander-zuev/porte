import { z } from 'zod'

import { ConversationEventSchema } from '../conversation/conversation-event.ts'
import {
  ConversationsSchema,
  ConversationIdentitySchema,
  ConversationSummarySchema,
  ConversationTurnStateSchema,
} from '../conversation/conversation.ts'
import { ApiErrorSchema, type ApiError } from '../errors/api-error.ts'
import {
  ConnectionIdSchema,
  EventIdSchema,
  MessageIdSchema,
  PermissionIdSchema,
  RequestIdSchema,
  ConversationIdSchema,
  ToolCallIdSchema,
  TurnIdSchema,
} from '../identity/identity.ts'

/**
 * These schemas define the published Porte HTTP and WebSocket contract.
 * ACP and UI library types do not cross this boundary.
 */
export type ApiResponse<T> = { success: true; data: T } | { success: false; error: ApiError }

export function createApiResponseSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data }),
    z.object({ success: z.literal(false), error: ApiErrorSchema }),
  ])
}

const EmptyPayloadSchema = z.object({})

/**
 * Where in a stored transcript one page starts.
 *
 * A count of turns from the oldest, so an appended turn leaves every cursor
 * already handed out pointing at the same place. Kept a string on the wire
 * because it is opaque to the caller: only the Mac reads it.
 */
const TranscriptCursorSchema = z.string().regex(/^\d+$/, { error: 'Cursor must be a whole number' })

export const ClientMethodSchemas = {
  /**
   * Report the whole list again, so the relay's replica catches up.
   *
   * Asked by the relay, never by a browser: the Mac cannot see a conversation
   * started or deleted outside Porte, so the list is only ever as fresh as the
   * last sweep. The answer arrives as `conversations.sync` frames, not here.
   */
  'conversations.sync': {
    params: EmptyPayloadSchema,
    result: EmptyPayloadSchema,
  },
  /** Metadata and one page of stored transcript. Starts no agent process. */
  'conversation.read': {
    params: z.object({
      conversationId: ConversationIdSchema,
      cursor: TranscriptCursorSchema.nullable(),
      limit: z.number().int().min(1).max(500),
    }),
    result: z.object({
      conversation: ConversationIdentitySchema,
      events: z.array(ConversationEventSchema),
      next: TranscriptCursorSchema.nullable(),
      /** Whether a turn is running right now, so a browser knows to re-attach. */
      turn: ConversationTurnStateSchema,
    }),
  },
  'conversation.open': {
    params: z.object({ conversationId: ConversationIdSchema }),
    result: z.object({
      conversation: ConversationIdentitySchema,
      turn: ConversationTurnStateSchema,
    }),
  },
  'conversation.close': {
    params: z.object({ conversationId: ConversationIdSchema }),
    result: EmptyPayloadSchema,
  },
  'conversation.create': {
    params: z.object({ cwd: z.string().min(1) }),
    result: z.object({ conversation: ConversationSummarySchema }),
  },
  'turn.start': {
    params: z.object({
      conversationId: ConversationIdSchema,
      turnId: TurnIdSchema,
      prompt: z.string().min(1),
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

export type ClientMethod = keyof typeof ClientMethodSchemas
export type ClientMethodMap = {
  [Method in ClientMethod]: {
    params: z.infer<(typeof ClientMethodSchemas)[Method]['params']>
    result: z.infer<(typeof ClientMethodSchemas)[Method]['result']>
  }
}
export type RequestMessage<Method extends ClientMethod = ClientMethod> = Method extends ClientMethod
  ? {
      v: 1
      type: 'request'
      requestId: z.infer<typeof RequestIdSchema>
      method: Method
      params: ClientMethodMap[Method]['params']
    }
  : never

export type ResultMessage<Method extends ClientMethod = ClientMethod> = {
  v: 1
  type: 'result'
  requestId: z.infer<typeof RequestIdSchema>
  result: ClientMethodMap[Method]['result']
}

export type ErrorMessage = {
  v: 1
  type: 'error'
  requestId: z.infer<typeof RequestIdSchema>
  error: ApiError
}

function createRequestSchema<Method extends ClientMethod, Params extends z.ZodType>(
  method: Method,
  params: Params,
) {
  return z.object({
    v: z.literal(1),
    type: z.literal('request'),
    requestId: RequestIdSchema,
    method: z.literal(method),
    params,
  })
}

export const RequestMessageSchema = z.discriminatedUnion('method', [
  createRequestSchema('conversations.sync', ClientMethodSchemas['conversations.sync'].params),
  createRequestSchema('conversation.read', ClientMethodSchemas['conversation.read'].params),
  createRequestSchema('conversation.open', ClientMethodSchemas['conversation.open'].params),
  createRequestSchema('conversation.close', ClientMethodSchemas['conversation.close'].params),
  createRequestSchema('conversation.create', ClientMethodSchemas['conversation.create'].params),
  createRequestSchema('turn.start', ClientMethodSchemas['turn.start'].params),
  createRequestSchema('turn.cancel', ClientMethodSchemas['turn.cancel'].params),
  createRequestSchema('permission.answer', ClientMethodSchemas['permission.answer'].params),
])

export const ErrorMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal('error'),
  requestId: RequestIdSchema,
  error: ApiErrorSchema,
})

export const ResultMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal('result'),
  requestId: RequestIdSchema,
  result: z.unknown(),
})

// Local: the canonical tool vocabulary lives in `conversation-tool-event.ts`.
// These describe the older relay shape and are read nowhere but this file.
const ToolKindSchema = z.enum(['read', 'edit', 'execute', 'other'])

const ToolStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed'])

const ToolContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('diff'),
    path: z.string(),
    oldText: z.string(),
    newText: z.string(),
  }),
])

export const ConversationUpdateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user_text'), text: z.string() }),
  z.object({ kind: z.literal('agent_text'), text: z.string() }),
  z.object({ kind: z.literal('reasoning_text'), text: z.string() }),
  z.object({ kind: z.literal('conversation_title'), title: z.string() }),
  z.object({
    kind: z.literal('tool_call'),
    toolCallId: ToolCallIdSchema,
    title: z.string(),
    toolKind: ToolKindSchema,
  }),
  z.object({
    kind: z.literal('tool_update'),
    toolCallId: ToolCallIdSchema,
    title: z.string().optional(),
    status: ToolStatusSchema,
    content: z.array(ToolContentSchema),
  }),
])
export type ConversationUpdate = z.infer<typeof ConversationUpdateSchema>

const ConversationUpdateBaseSchema = z.object({
  conversationId: ConversationIdSchema,
  messageId: MessageIdSchema,
  eventId: EventIdSchema,
  update: ConversationUpdateSchema,
})

export const ConversationUpdateEventSchema = z.discriminatedUnion('delivery', [
  ConversationUpdateBaseSchema.extend({ delivery: z.literal('replay') }),
  ConversationUpdateBaseSchema.extend({ delivery: z.literal('live'), turnId: TurnIdSchema }),
])
export type ConversationUpdateEvent = z.infer<typeof ConversationUpdateEventSchema>

export const TurnFinishedEventSchema = z.intersection(
  z.object({ conversationId: ConversationIdSchema, turnId: TurnIdSchema }),
  z.discriminatedUnion('outcome', [
    z.object({ outcome: z.enum(['end_turn', 'cancelled']) }),
    z.object({ outcome: z.literal('failed'), error: ApiErrorSchema }),
  ]),
)
export type TurnFinishedEvent = z.infer<typeof TurnFinishedEventSchema>

export const PermissionRequestedEventSchema = z.object({
  conversationId: ConversationIdSchema,
  turnId: TurnIdSchema,
  permissionId: PermissionIdSchema,
  toolCall: z.object({
    toolCallId: ToolCallIdSchema,
    kind: z.string(),
    title: z.string(),
  }),
  options: z.array(
    z.object({
      optionId: z.string().min(1),
      name: z.string(),
      kind: z.enum(['allow_once', 'allow_always', 'reject_once', 'reject_always']),
    }),
  ),
})
export type PermissionRequestedEvent = z.infer<typeof PermissionRequestedEventSchema>

export const ClientEventSchemas = {
  'host.status': z.object({ status: z.enum(['online', 'offline']) }),
  // No payload: the list is read over HTTP, so the socket only says "ask again".
  'conversations.invalidated': z.object({}),
  'conversation.summary.changed': z.object({ conversation: ConversationSummarySchema }),
  'conversation.removed': z.object({ conversationId: ConversationIdSchema }),
  'conversation.event': ConversationEventSchema,
  'conversation.update': ConversationUpdateEventSchema,
  'turn.finished': TurnFinishedEventSchema,
  'permission.requested': PermissionRequestedEventSchema,
} as const

export type ClientEvent = keyof typeof ClientEventSchemas
export type ClientEventMap = {
  [Event in ClientEvent]: z.infer<(typeof ClientEventSchemas)[Event]>
}

export type EventMessage<Event extends ClientEvent = ClientEvent> = Event extends ClientEvent
  ? {
      v: 1
      type: 'event'
      event: Event
      data: ClientEventMap[Event]
    }
  : never

function createEventSchema<Event extends ClientEvent, Data extends z.ZodType>(
  event: Event,
  data: Data,
) {
  return z.object({
    v: z.literal(1),
    type: z.literal('event'),
    event: z.literal(event),
    data,
  })
}

export const EventMessageSchema = z.discriminatedUnion('event', [
  createEventSchema('host.status', ClientEventSchemas['host.status']),
  createEventSchema('conversations.invalidated', ClientEventSchemas['conversations.invalidated']),
  createEventSchema(
    'conversation.summary.changed',
    ClientEventSchemas['conversation.summary.changed'],
  ),
  createEventSchema('conversation.removed', ClientEventSchemas['conversation.removed']),
  createEventSchema('conversation.event', ClientEventSchemas['conversation.event']),
  createEventSchema('conversation.update', ClientEventSchemas['conversation.update']),
  createEventSchema('turn.finished', ClientEventSchemas['turn.finished']),
  createEventSchema('permission.requested', ClientEventSchemas['permission.requested']),
])

export const ClientMessageSchema = z.union([
  RequestMessageSchema,
  ResultMessageSchema,
  ErrorMessageSchema,
  EventMessageSchema,
])

const RouteSchema = z.object({ connectionId: ConnectionIdSchema })

/** Every client method reaches the Mac, so a routed request carries any of them. */
export const RoutedRequestSchema = z.object({
  route: RouteSchema,
  message: RequestMessageSchema,
})

export type RoutedRequest<Method extends ClientMethod = ClientMethod> = {
  route: { connectionId: z.infer<typeof ConnectionIdSchema> }
  message: RequestMessage<Method>
}

function createRoutedResponseSchema<Method extends ClientMethod, Result extends z.ZodType>(
  method: Method,
  resultSchema: Result,
) {
  const result = z.object({
    v: z.literal(1),
    type: z.literal('result'),
    requestId: RequestIdSchema,
    result: resultSchema,
  })

  return z.object({
    route: RouteSchema,
    method: z.literal(method),
    message: z.union([result, ErrorMessageSchema]),
  })
}

export const RoutedResponseSchema = z.discriminatedUnion('method', [
  createRoutedResponseSchema(
    'conversations.sync',
    ClientMethodSchemas['conversations.sync'].result,
  ),
  createRoutedResponseSchema('conversation.read', ClientMethodSchemas['conversation.read'].result),
  createRoutedResponseSchema('conversation.open', ClientMethodSchemas['conversation.open'].result),
  createRoutedResponseSchema(
    'conversation.close',
    ClientMethodSchemas['conversation.close'].result,
  ),
  createRoutedResponseSchema(
    'conversation.create',
    ClientMethodSchemas['conversation.create'].result,
  ),
  createRoutedResponseSchema('turn.start', ClientMethodSchemas['turn.start'].result),
  createRoutedResponseSchema('turn.cancel', ClientMethodSchemas['turn.cancel'].result),
  createRoutedResponseSchema('permission.answer', ClientMethodSchemas['permission.answer'].result),
])

export type RoutedResponse<Method extends ClientMethod = ClientMethod> = Method extends ClientMethod
  ? {
      route: { connectionId: z.infer<typeof ConnectionIdSchema> }
      method: Method
      message: ResultMessage<Method> | ErrorMessage
    }
  : never

export const RoutedAudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('host') }),
  z.object({ type: z.literal('connection'), connectionId: ConnectionIdSchema }),
  z.object({ type: z.literal('conversation'), conversationId: ConversationIdSchema }),
])

export const RoutedEventSchema = z.object({
  audience: RoutedAudienceSchema,
  message: EventMessageSchema,
})
export type RoutedEvent = z.infer<typeof RoutedEventSchema>

/**
 * What the Mac tells the relay, rather than through it.
 *
 * A routed event is carried to an audience unopened. These are addressed to the
 * relay itself: it writes them down, and decides separately what a browser
 * should hear about it. Keeping them a distinct kind is what stops a frame that
 * no client should see from arriving as one that every client does.
 */
export const RelayMessageSchema = z.discriminatedUnion('relay', [
  z.object({
    relay: z.literal('conversations.sync'),
    /** One id per sync run. Rows still carrying an older one are gone from the Mac. */
    syncRunId: z.string().min(1),
    conversations: ConversationsSchema,
    done: z.boolean(),
  }),
  z.object({
    relay: z.literal('conversation.summary'),
    conversation: ConversationSummarySchema,
  }),
  z.object({
    relay: z.literal('conversation.removed'),
    conversationId: ConversationIdSchema,
  }),
])
export type RelayMessage = z.infer<typeof RelayMessageSchema>

export const DaemonMessageSchema = z.union([
  RoutedResponseSchema,
  RoutedEventSchema,
  RelayMessageSchema,
])
export type DaemonMessage = z.infer<typeof DaemonMessageSchema>
