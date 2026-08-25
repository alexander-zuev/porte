import { createConversation } from '@host/application/commands/create-conversation.command.ts'
import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import { listConversations } from '@host/application/queries/list-conversations.query.ts'
import type { SessionOperations } from '@host/application/session-supervisor.ts'
import { type JsonRpcMethodHandlers } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import { HostControlMethods, type ConversationId } from '@porte/core/client'

/** Resources available to control method handlers. */
export type ControlMethodContext = {
  readonly connections: {
    connectConversation(conversationId: ConversationId): void
  }
  readonly codingAgent: CodingAgent
  readonly sessions: SessionOperations
}

/** One exhaustive handler for each inbound control request. */
export type ControlMethodHandlerRegistry = JsonRpcMethodHandlers<
  typeof HostControlMethods,
  ControlMethodContext
>

/** Application handlers for every inbound control request. */
export const CONTROL_METHOD_HANDLERS = {
  'conversations.list': (params, context) => listConversations(context.codingAgent, params),

  'conversation.create': (params, context) => createConversation(context.sessions, params),

  'conversation.attach': async (params, context) => {
    context.connections.connectConversation(params.conversationId)
    return null
  },
} satisfies ControlMethodHandlerRegistry
