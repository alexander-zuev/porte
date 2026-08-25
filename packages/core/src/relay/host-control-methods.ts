import { z } from 'zod'

import {
  ConversationSchema,
  ListConversationsParamsSchema,
  ListConversationsResultSchema,
} from '../conversation/conversation.ts'
import { ConversationIdSchema } from '../identity/identity.ts'
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
import { HostApplicationErrorSchema, HostRequestIdSchema } from './host-json-rpc.ts'

const EmptyResultSchema = z.null()

/** The stable identity of one logical conversation creation. */
export const ConversationCreationIdSchema = z.uuidv7().brand<'ConversationCreationId'>()

/** The stable identity of one logical conversation creation. */
export type ConversationCreationId = z.infer<typeof ConversationCreationIdSchema>

/** Every method allowed on the Host control connection. */
export const HostControlMethods = {
  'conversations.list': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: ListConversationsParamsSchema,
    result: ListConversationsResultSchema,
  },
  'conversation.create': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      creationId: ConversationCreationIdSchema,
      cwd: z.string().min(1),
    }),
    result: ConversationSchema,
  },
  'conversation.attach': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({ conversationId: ConversationIdSchema }),
    result: EmptyResultSchema,
  },
  'conversation.updated': {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: z.strictObject({ conversation: ConversationSchema }),
  },
  'conversation.removed': {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: z.strictObject({ conversationId: ConversationIdSchema }),
  },
} as const satisfies Record<string, JsonRpcMethodDefinition>

/** Every method accepted by the Host control connection. */
export type HostControlMethod = JsonRpcRegistryMethod<typeof HostControlMethods>

/** Every Host control method that receives a response. */
export type HostControlRequestMethod = JsonRpcRegistryRequestMethod<typeof HostControlMethods>

/** Every Host control method that does not receive a response. */
export type HostControlNotificationMethod = JsonRpcRegistryNotificationMethod<
  typeof HostControlMethods
>

/** Parsed Host control payloads derived from the method registry. */
export type HostControlMethodMap = JsonRpcRegistryMethodMap<typeof HostControlMethods>

/** Create the boundary schema for one relay-to-Host control request. */
export function hostControlRequestSchema<Method extends HostControlRequestMethod>(method: Method) {
  return jsonRpcRequestSchema(method, HostControlMethods[method].params, HostRequestIdSchema)
}

/** Create the boundary schema for one Host control response. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- The return schema depends on the selected method.
export function hostControlResponseSchema<Method extends HostControlRequestMethod>(method: Method) {
  return jsonRpcResponseSchema(
    HostControlMethods[method].result,
    HostApplicationErrorSchema,
    HostRequestIdSchema,
  )
}

/** Create the boundary schema for one Host-to-relay control notification. */
export function hostControlNotificationSchema<Method extends HostControlNotificationMethod>(
  method: Method,
) {
  return jsonRpcNotificationSchema(method, HostControlMethods[method].params)
}
