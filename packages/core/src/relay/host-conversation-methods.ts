import { z } from 'zod'

import { CanonicalContentSchema } from '../conversation/canonical-content.ts'
import { ElicitationAnswerSchema } from '../conversation/conversation-elicitation-event.ts'
import { ConversationEventSchema } from '../conversation/conversation-event.ts'
import {
  ConversationStateSchema,
  ConversationTurnSchema,
} from '../conversation/conversation-view.ts'
import {
  AttemptIdSchema,
  ElicitationIdSchema,
  MessageIdSchema,
  PermissionIdSchema,
  TurnIdSchema,
} from '../identity/identity.ts'
import {
  JSON_RPC_METHOD_KINDS,
  type JsonRpcMethodDefinition,
  type JsonRpcRegistryMethod,
  type JsonRpcRegistryMethodMap,
  type JsonRpcRegistryNotificationMethod,
  type JsonRpcRegistryRequestMethod,
  jsonRpcNotificationSchema,
  jsonRpcRequestSchema,
  jsonRpcResponseSchema,
} from '../websocket/json-rpc.ts'
import {
  HostApplicationErrorSchema,
  HostRequestIdSchema,
  sequencedParams,
} from './host-json-rpc.ts'

const EmptyResultSchema = z.null()

/** One configuration value sent to an active conversation. */
export const ConversationConfigurationValueSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('select'), value: z.string().min(1) }),
  z.strictObject({ type: z.literal('boolean'), value: z.boolean() }),
])

/** One configuration value sent to an active conversation. */
export type ConversationConfigurationValue = z.infer<typeof ConversationConfigurationValueSchema>

/** Every method allowed on one Host conversation connection. */
export const HostConversationMethods = {
  'conversation.close': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({}),
    result: EmptyResultSchema,
  },
  'conversation.get': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({}),
    result: ConversationStateSchema,
  },
  // The Host mints the turn id; `turn.started { turnId, attemptId }` tells the relay which one.
  'turn.start': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      attemptId: AttemptIdSchema,
      userMessage: z.strictObject({
        id: MessageIdSchema,
        content: z.array(CanonicalContentSchema).min(1),
      }),
    }),
    result: EmptyResultSchema,
  },
  'turn.get': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({ turnId: TurnIdSchema }),
    result: ConversationTurnSchema,
  },
  'turn.cancel': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({ turnId: TurnIdSchema }),
    result: EmptyResultSchema,
  },
  'conversation.configuration.set': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      optionId: z.string().min(1),
      value: ConversationConfigurationValueSchema,
    }),
    result: EmptyResultSchema,
  },
  'permission.answer': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      turnId: TurnIdSchema,
      permissionId: PermissionIdSchema,
      optionId: z.string().min(1),
    }),
    result: EmptyResultSchema,
  },
  'elicitation.answer': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      turnId: TurnIdSchema,
      elicitationId: ElicitationIdSchema,
      answer: ElicitationAnswerSchema,
    }),
    result: EmptyResultSchema,
  },
  'conversation.event': {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: sequencedParams({ event: ConversationEventSchema }),
  },
} as const satisfies Record<string, JsonRpcMethodDefinition>

/** Every method accepted by one Host conversation connection. */
export type HostConversationMethod = JsonRpcRegistryMethod<typeof HostConversationMethods>

/** Every Host conversation method that receives a response. */
export type HostConversationRequestMethod = JsonRpcRegistryRequestMethod<
  typeof HostConversationMethods
>

/** Every Host conversation method that does not receive a response. */
export type HostConversationNotificationMethod = JsonRpcRegistryNotificationMethod<
  typeof HostConversationMethods
>

/** Parsed Host conversation payloads derived from the method registry. */
export type HostConversationMethodMap = JsonRpcRegistryMethodMap<typeof HostConversationMethods>

/** Create the boundary schema for one relay-to-Host conversation request. */
export function hostConversationRequestSchema<Method extends HostConversationRequestMethod>(
  method: Method,
) {
  return jsonRpcRequestSchema(method, HostConversationMethods[method].params, HostRequestIdSchema)
}

/** Create the boundary schema for one Host conversation response. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- The return schema depends on the selected method.
export function hostConversationResponseSchema<Method extends HostConversationRequestMethod>(
  method: Method,
) {
  return jsonRpcResponseSchema(
    HostConversationMethods[method].result,
    HostApplicationErrorSchema,
    HostRequestIdSchema,
  )
}

/** Create the boundary schema for one Host-to-relay conversation notification. */
export function hostConversationNotificationSchema<
  Method extends HostConversationNotificationMethod,
>(method: Method) {
  return jsonRpcNotificationSchema(method, HostConversationMethods[method].params)
}
