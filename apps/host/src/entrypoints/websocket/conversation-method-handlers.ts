import { answerElicitation } from '@host/application/commands/answer-elicitation.command.ts'
import { answerPermission } from '@host/application/commands/answer-permission.command.ts'
import { cancelTurn } from '@host/application/commands/cancel-turn.command.ts'
import { closeConversation } from '@host/application/commands/close-conversation.command.ts'
import { setConversationConfiguration } from '@host/application/commands/set-conversation-configuration.command.ts'
import { startTurn } from '@host/application/commands/start-turn.command.ts'
import type { SessionOperations } from '@host/application/session-supervisor.ts'
import { type JsonRpcMethodHandlers } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import { HostConversationMethods, type ConversationId } from '@porte/core/client'

/** Resources available to conversation method handlers. */
export type ConversationMethodContext = {
  readonly conversationId: ConversationId
  readonly sessions: SessionOperations
}

/** One exhaustive handler for each inbound conversation request. */
export type ConversationMethodHandlerRegistry = JsonRpcMethodHandlers<
  typeof HostConversationMethods,
  ConversationMethodContext
>

/** Application handlers for every inbound conversation request. */
export const CONVERSATION_METHOD_HANDLERS = {
  'conversation.close': async (_params, context) => {
    await closeConversation(context.sessions, context.conversationId)
    return null
  },

  'turn.start': async (params, context) => {
    await startTurn(context.sessions, context.conversationId, params)
    return null
  },

  'turn.cancel': async (params, context) => {
    await cancelTurn(context.sessions, context.conversationId, params)
    return null
  },

  'conversation.configuration.set': async (params, context) => {
    await setConversationConfiguration(context.sessions, context.conversationId, params)
    return null
  },

  'permission.answer': async (params, context) => {
    await answerPermission(context.sessions, context.conversationId, params)
    return null
  },

  'elicitation.answer': async (params, context) => {
    await answerElicitation(context.sessions, context.conversationId, params)
    return null
  },
} satisfies ConversationMethodHandlerRegistry
