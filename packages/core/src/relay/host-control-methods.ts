import { z } from 'zod'

import { ConversationMetadataPatchSchema } from '../conversation/conversation-lifecycle-event.ts'
import {
  ConversationCursorSchema,
  ListConversationsResultSchema,
} from '../conversation/conversation-list.ts'
import { ConversationSummarySchema } from '../conversation/conversation-summary.ts'
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
import {
  HostApplicationErrorSchema,
  HostRequestIdSchema,
  sequencedParams,
} from './host-json-rpc.ts'

const EmptyResultSchema = z.null()

/** Every method allowed on the Host control connection. */
export const HostControlMethods = {
  'conversations.list': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({ cursor: ConversationCursorSchema.optional() }),
    result: ListConversationsResultSchema,
  },
  'conversation.create': {
    kind: JSON_RPC_METHOD_KINDS.request,
    params: z.strictObject({
      cwd: z.string().min(1),
      mcpServers: z.array(z.json()).optional(),
    }),
    result: ConversationSummarySchema,
  },
  'conversation.attach': {
    kind: JSON_RPC_METHOD_KINDS.request,
    // `cwd` lets the Host load the session directly; the agent rejects a wrong one.
    params: z.strictObject({ conversationId: ConversationIdSchema, cwd: z.string().min(1) }),
    result: EmptyResultSchema,
  },
  'conversation.updated': {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: sequencedParams({
      conversationId: ConversationIdSchema,
      update: ConversationMetadataPatchSchema,
    }),
  },
  'conversation.removed': {
    kind: JSON_RPC_METHOD_KINDS.notification,
    params: sequencedParams({ conversationId: ConversationIdSchema }),
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
