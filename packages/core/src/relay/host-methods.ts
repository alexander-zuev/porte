import { z } from 'zod'

import { CanonicalContentSchema } from '../conversation/canonical-content.ts'
import { ElicitationAnswerSchema } from '../conversation/conversation-elicitation-event.ts'
import { ConversationEventSchema } from '../conversation/conversation-event.ts'
import {
  ReadConversationParamsSchema,
  ReadConversationResultSchema,
} from '../conversation/conversation-history.ts'
import { ConversationStateSchema } from '../conversation/conversation-view.ts'
import {
  ConversationListRevisionSchema,
  ConversationSchema,
  ListConversationsParamsSchema,
  ListConversationsResultSchema,
} from '../conversation/conversation.ts'
import { PorteErrorPayloadSchema } from '../errors/porte-error-payload.ts'
import {
  ConversationIdSchema,
  ElicitationIdSchema,
  EventSequenceSchema,
  MessageIdSchema,
  PermissionIdSchema,
  TurnIdSchema,
} from '../identity/identity.ts'
import {
  JSON_RPC_METHOD_KINDS,
  type JsonRpcMethodDefinition,
  jsonRpcNotificationSchema,
  jsonRpcRequestSchema,
  jsonRpcResponseSchema,
} from '../websocket/json-rpc.ts'

const EmptyResultSchema = z.null()

const ConversationConfigurationValueSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('select'), value: z.string().min(1) }),
  z.strictObject({ type: z.literal('boolean'), value: z.boolean() }),
])

/** The stable identity of one logical conversation creation. */
export const ConversationCreationIdSchema = z.uuidv7().brand<'ConversationCreationId'>()

/** The stable identity of one logical conversation creation. */
export type ConversationCreationId = z.infer<typeof ConversationCreationIdSchema>

/** The fixed JSON-RPC message for an expected Host application failure. */
export const HOST_APPLICATION_ERROR_MESSAGE = 'Application error'

/** The JSON-RPC code for every expected Host application failure. */
export const HOST_APPLICATION_ERROR_CODE = -32_000

/** The correlation identifier for one Host request and response. */
export const HostRequestIdSchema = z.uuidv7().brand<'HostRequestId'>()

/** The correlation identifier for one Host request and response. */
export type HostRequestId = z.infer<typeof HostRequestIdSchema>

/** One expected Host failure in a JSON-RPC error response. */
export const HostApplicationErrorSchema = z.strictObject({
  code: z.literal(HOST_APPLICATION_ERROR_CODE),
  message: z.literal(HOST_APPLICATION_ERROR_MESSAGE),
  data: PorteErrorPayloadSchema,
})

/** The complete Host method contract for the JSON-RPC boundary. */
export const HostMethods = {
  // Queries.
  'conversations.list': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: ListConversationsParamsSchema,
    result: ListConversationsResultSchema,
  },
  'conversation.read': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: ReadConversationParamsSchema,
    result: ReadConversationResultSchema,
  },

  // Commands.
  'conversation.create': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      creationId: ConversationCreationIdSchema,
      cwd: z.string().min(1),
    }),
    result: ConversationSchema,
  },
  'conversation.close': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({ conversationId: ConversationIdSchema }),
    result: EmptyResultSchema,
  },
  'turn.start': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      conversationId: ConversationIdSchema,
      turnId: TurnIdSchema,
      userMessage: z.strictObject({
        id: MessageIdSchema,
        content: z.array(CanonicalContentSchema).min(1),
      }),
    }),
    result: EmptyResultSchema,
  },
  'turn.cancel': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({ conversationId: ConversationIdSchema, turnId: TurnIdSchema }),
    result: EmptyResultSchema,
  },
  'conversation.configuration.set': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      conversationId: ConversationIdSchema,
      optionId: z.string().min(1),
      value: ConversationConfigurationValueSchema,
    }),
    result: EmptyResultSchema,
  },
  'permission.answer': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      conversationId: ConversationIdSchema,
      turnId: TurnIdSchema,
      permissionId: PermissionIdSchema,
      optionId: z.string().min(1),
    }),
    result: EmptyResultSchema,
  },
  'elicitation.answer': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      conversationId: ConversationIdSchema,
      turnId: TurnIdSchema,
      elicitationId: ElicitationIdSchema,
      answer: ElicitationAnswerSchema,
    }),
    result: EmptyResultSchema,
  },

  // Conversation list notifications.
  'conversation.updated': {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: z.strictObject({
      conversation: ConversationSchema,
      revision: ConversationListRevisionSchema,
    }),
  },
  'conversation.removed': {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: z.strictObject({
      conversationId: ConversationIdSchema,
      revision: ConversationListRevisionSchema,
    }),
  },

  // Active conversation notifications.
  'conversation.state': {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: z.strictObject({
      conversationId: ConversationIdSchema,
      throughEventSequence: EventSequenceSchema,
      state: ConversationStateSchema,
    }),
  },
  'conversation.event': {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: z.strictObject({
      conversationId: ConversationIdSchema,
      eventSequence: EventSequenceSchema,
      event: ConversationEventSchema,
    }),
  },
} as const satisfies Record<string, JsonRpcMethodDefinition>

/** Every method accepted by the Host JSON-RPC boundary. */
export type HostMethod = keyof typeof HostMethods

/** Every Host method that receives a JSON-RPC response. */
export type HostRequestMethod = {
  [
    Method in HostMethod
  ]: (typeof HostMethods)[Method]['kind'] extends typeof JSON_RPC_METHOD_KINDS.request
    ? Method
    : never
}[HostMethod]

/** Every Host method that does not receive a JSON-RPC response. */
export type HostNotificationMethod = Exclude<HostMethod, HostRequestMethod>

/** The method kind and parsed payload types derived from `HostMethods`. */
export type HostMethodMap = {
  [Method in HostMethod]: (typeof HostMethods)[Method] extends {
    readonly kind: typeof JSON_RPC_METHOD_KINDS.request
    readonly params: infer Params extends z.ZodType
    readonly result: infer Result extends z.ZodType
  }
    ? {
        readonly kind: typeof JSON_RPC_METHOD_KINDS.request
        readonly params: z.infer<Params>
        readonly result: z.infer<Result>
      }
    : (typeof HostMethods)[Method] extends {
          readonly kind: typeof JSON_RPC_METHOD_KINDS.notification
          readonly params: infer Params extends z.ZodType
        }
      ? {
          readonly kind: typeof JSON_RPC_METHOD_KINDS.notification
          readonly params: z.infer<Params>
        }
      : never
}

/** Create the boundary schema for one relay-to-Host request. */
export function hostRequestSchema<Method extends HostRequestMethod>(method: Method) {
  return jsonRpcRequestSchema(method, HostMethods[method].params, HostRequestIdSchema)
}

/** Create the boundary schema for one Host response. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- The return schema depends on the selected method.
export function hostResponseSchema<Method extends HostRequestMethod>(method: Method) {
  return jsonRpcResponseSchema(
    HostMethods[method].result,
    HostApplicationErrorSchema,
    HostRequestIdSchema,
  )
}

/** Create the boundary schema for one Host-to-relay notification. */
export function hostNotificationSchema<Method extends HostNotificationMethod>(method: Method) {
  return jsonRpcNotificationSchema(method, HostMethods[method].params)
}
