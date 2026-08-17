import { z } from 'zod'

import {
  ConnectionIdSchema,
  EventIdSchema,
  MessageIdSchema,
  PermissionIdSchema,
  RequestIdSchema,
  SessionIdSchema,
  ToolCallIdSchema,
  TurnIdSchema,
} from './identity.ts'
import {
  HostSnapshotSchema,
  SessionSummarySchema,
  SessionTurnStateSchema,
  SyncedSessionCatalogSchema,
} from './session.ts'

/**
 * These schemas define the published LRAS HTTP and WebSocket contract.
 * ACP and UI library types do not cross this boundary.
 */
export const ApiErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'NOT_AUTHENTICATED',
  'NOT_AUTHORIZED',
  'HOST_OFFLINE',
  'WORKSPACE_NOT_ALLOWED',
  'SESSION_NOT_FOUND',
  'SESSION_BUSY',
  'TURN_NOT_FOUND',
  'PERMISSION_NOT_FOUND',
  'PAIRING_NOT_FOUND',
  'PAIRING_EXPIRED',
  'HOST_ALREADY_PAIRED',
  'RATE_LIMITED',
  'REQUEST_TIMEOUT',
  'GROK_UNAVAILABLE',
  'INTERNAL_ERROR',
])
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>

export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

export type ApiResponse<T> = { success: true; data: T } | { success: false; error: ApiError }

export function createApiResponseSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data }),
    z.object({ success: z.literal(false), error: ApiErrorSchema }),
  ])
}

const EmptyParamsSchema = z.object({})
const EmptyResultSchema = z.object({})

export const ClientMethodSchemas = {
  'host.snapshot': {
    params: EmptyParamsSchema,
    result: HostSnapshotSchema,
  },
  'session.open': {
    params: z.object({ sessionId: SessionIdSchema }),
    result: z.object({ session: SessionSummarySchema, turn: SessionTurnStateSchema }),
  },
  'session.close': {
    params: z.object({ sessionId: SessionIdSchema }),
    result: EmptyResultSchema,
  },
  'session.create': {
    params: z.object({ cwd: z.string().min(1) }),
    result: z.object({ session: SessionSummarySchema }),
  },
  'turn.start': {
    params: z.object({
      sessionId: SessionIdSchema,
      turnId: TurnIdSchema,
      prompt: z.string().min(1),
    }),
    result: z.object({ turnId: TurnIdSchema }),
  },
  'turn.cancel': {
    params: z.object({ sessionId: SessionIdSchema, turnId: TurnIdSchema }),
    result: z.object({ turnId: TurnIdSchema }),
  },
  'permission.answer': {
    params: z.object({
      sessionId: SessionIdSchema,
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
export type DaemonMethod = Exclude<ClientMethod, 'host.snapshot'>

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
  createRequestSchema('host.snapshot', ClientMethodSchemas['host.snapshot'].params),
  createRequestSchema('session.open', ClientMethodSchemas['session.open'].params),
  createRequestSchema('session.close', ClientMethodSchemas['session.close'].params),
  createRequestSchema('session.create', ClientMethodSchemas['session.create'].params),
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

export const ToolKindSchema = z.enum(['read', 'edit', 'execute', 'other'])
export type ToolKind = z.infer<typeof ToolKindSchema>

export const ToolStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed'])
export type ToolStatus = z.infer<typeof ToolStatusSchema>

export const ToolContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('diff'),
    path: z.string(),
    oldText: z.string(),
    newText: z.string(),
  }),
])
export type ToolContent = z.infer<typeof ToolContentSchema>

export const SessionUpdateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user_text'), text: z.string() }),
  z.object({ kind: z.literal('agent_text'), text: z.string() }),
  z.object({ kind: z.literal('reasoning_text'), text: z.string() }),
  z.object({ kind: z.literal('session_title'), title: z.string() }),
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
export type SessionUpdate = z.infer<typeof SessionUpdateSchema>

const SessionUpdateBaseSchema = z.object({
  sessionId: SessionIdSchema,
  messageId: MessageIdSchema,
  eventId: EventIdSchema,
  update: SessionUpdateSchema,
})

export const SessionUpdateEventSchema = z.discriminatedUnion('delivery', [
  SessionUpdateBaseSchema.extend({ delivery: z.literal('replay') }),
  SessionUpdateBaseSchema.extend({ delivery: z.literal('live'), turnId: TurnIdSchema }),
])
export type SessionUpdateEvent = z.infer<typeof SessionUpdateEventSchema>

export const TurnFinishedEventSchema = z.intersection(
  z.object({ sessionId: SessionIdSchema, turnId: TurnIdSchema }),
  z.discriminatedUnion('outcome', [
    z.object({ outcome: z.enum(['end_turn', 'cancelled']) }),
    z.object({ outcome: z.literal('failed'), error: ApiErrorSchema }),
  ]),
)
export type TurnFinishedEvent = z.infer<typeof TurnFinishedEventSchema>

export const PermissionRequestedEventSchema = z.object({
  sessionId: SessionIdSchema,
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
  'sessions.changed': z.object({ catalog: SyncedSessionCatalogSchema }),
  'session.update': SessionUpdateEventSchema,
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
  createEventSchema('sessions.changed', ClientEventSchemas['sessions.changed']),
  createEventSchema('session.update', ClientEventSchemas['session.update']),
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
const DaemonRequestMessageSchema = z.discriminatedUnion('method', [
  createRequestSchema('session.open', ClientMethodSchemas['session.open'].params),
  createRequestSchema('session.close', ClientMethodSchemas['session.close'].params),
  createRequestSchema('session.create', ClientMethodSchemas['session.create'].params),
  createRequestSchema('turn.start', ClientMethodSchemas['turn.start'].params),
  createRequestSchema('turn.cancel', ClientMethodSchemas['turn.cancel'].params),
  createRequestSchema('permission.answer', ClientMethodSchemas['permission.answer'].params),
])

export const RoutedRequestSchema = z.object({
  route: RouteSchema,
  message: DaemonRequestMessageSchema,
})

export type RoutedRequest<Method extends DaemonMethod = DaemonMethod> = {
  route: { connectionId: z.infer<typeof ConnectionIdSchema> }
  message: RequestMessage<Method>
}

function createRoutedResponseSchema<Method extends DaemonMethod, Result extends z.ZodType>(
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
  createRoutedResponseSchema('session.open', ClientMethodSchemas['session.open'].result),
  createRoutedResponseSchema('session.close', ClientMethodSchemas['session.close'].result),
  createRoutedResponseSchema('session.create', ClientMethodSchemas['session.create'].result),
  createRoutedResponseSchema('turn.start', ClientMethodSchemas['turn.start'].result),
  createRoutedResponseSchema('turn.cancel', ClientMethodSchemas['turn.cancel'].result),
  createRoutedResponseSchema('permission.answer', ClientMethodSchemas['permission.answer'].result),
])

export type RoutedResponse<Method extends DaemonMethod = DaemonMethod> = Method extends DaemonMethod
  ? {
      route: { connectionId: z.infer<typeof ConnectionIdSchema> }
      method: Method
      message: ResultMessage<Method> | ErrorMessage
    }
  : never

export const RoutedAudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('host') }),
  z.object({ type: z.literal('connection'), connectionId: ConnectionIdSchema }),
  z.object({ type: z.literal('session'), sessionId: SessionIdSchema }),
])

export const RoutedEventSchema = z.object({
  audience: RoutedAudienceSchema,
  message: EventMessageSchema,
})
export type RoutedEvent = z.infer<typeof RoutedEventSchema>

export const DaemonMessageSchema = z.union([RoutedResponseSchema, RoutedEventSchema])
export type DaemonMessage = z.infer<typeof DaemonMessageSchema>
