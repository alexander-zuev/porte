import { createConversation } from '@host/application/commands/create-conversation.command.ts'
import type { ConversationCatalog } from '@host/application/conversation-catalog.ts'
import type { AgentSessionFactory } from '@host/application/ports/agent-session-factory.ts'
import type { ConversationCreationStore } from '@host/application/ports/conversation-creation-store.ts'
import { listConversations } from '@host/application/queries/list-conversations.query.ts'
import type { SessionOperations } from '@host/application/session-supervisor.ts'
import { type JsonRpcMethodHandlers } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import { HostControlMethods, type ConversationId } from '@porte/core/client'

/** Resources available to control method handlers. */
export type ControlMethodContext = {
  readonly connections: {
    connectConversation(conversationId: ConversationId): void
  }
  readonly catalog: ConversationCatalog
  readonly creations: ConversationCreationStore
  readonly factory: AgentSessionFactory
  readonly sessions: SessionOperations
}

/** One exhaustive handler for each inbound control request. */
export type ControlMethodHandlerRegistry = JsonRpcMethodHandlers<
  typeof HostControlMethods,
  ControlMethodContext
>

/** Application handlers for every inbound control request. */
export const CONTROL_METHOD_HANDLERS = {
  'conversations.list': (params, context) =>
    listConversations(context.factory, context.catalog, params),

  'conversation.create': (params, context) =>
    createConversation(context.sessions, context.creations, context.catalog, params),

  'conversation.attach': async (params, context) => {
    context.connections.connectConversation(params.conversationId)
    return null
  },
} satisfies ControlMethodHandlerRegistry
