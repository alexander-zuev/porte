import type { IMessageBus } from '@host/application/message-bus.ts'
import type { HostConnections } from '@host/application/ports/host-connections.ts'
import { createCommand, createQuery } from '@host/domain/messages/types.ts'
import { type JsonRpcMethodHandlers } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import { HostControlMethods } from '@porte/core/client'

/** Resources available to control method handlers. */
export type ControlMethodContext = {
  readonly bus: IMessageBus
  readonly connections: Pick<HostConnections, 'connectConversation'>
}

/** One exhaustive handler for each inbound control request. */
export type ControlMethodHandlerRegistry = JsonRpcMethodHandlers<
  typeof HostControlMethods,
  ControlMethodContext
>

/** Parse → one bus message → answer. No logic lives here. */
export const CONTROL_METHOD_HANDLERS = {
  'conversations.list': (params, context) =>
    context.bus.handle(createQuery('ListConversations', params)),

  'conversation.create': (params, context) =>
    context.bus.handle(createCommand('CreateConversation', params)),

  // Answered only once the conversation socket is up and the conversation is open,
  // so the relay can read right after the acknowledgment.
  'conversation.attach': async (params, context) => {
    await context.connections.connectConversation(params.conversationId, params.cwd)
    return null
  },
} satisfies ControlMethodHandlerRegistry
