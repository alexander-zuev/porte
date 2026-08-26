import { answerElicitation } from '@host/application/commands/answer-elicitation.command.ts'
import { answerPermission } from '@host/application/commands/answer-permission.command.ts'
import { cancelTurn } from '@host/application/commands/cancel-turn.command.ts'
import { closeConversation } from '@host/application/commands/close-conversation.command.ts'
import { setConversationConfiguration } from '@host/application/commands/set-conversation-configuration.command.ts'
import { startTurn } from '@host/application/commands/start-turn.command.ts'
import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import { getConversation } from '@host/application/queries/get-conversation.query.ts'
import { type JsonRpcMethodHandlers } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import { HostConversationMethods, type ConversationId } from '@porte/core/client'

/** Resources available to conversation method handlers. */
export type ConversationMethodContext = {
  readonly conversationId: ConversationId
  readonly codingAgent: CodingAgent
}

/** One exhaustive handler for each inbound conversation request. */
export type ConversationMethodHandlerRegistry = JsonRpcMethodHandlers<
  typeof HostConversationMethods,
  ConversationMethodContext
>

/** Application handlers for every inbound conversation request. */
export const CONVERSATION_METHOD_HANDLERS = {
  'conversation.close': async (_params, context) => {
    await closeConversation(context.codingAgent, context.conversationId)
    return null
  },

  'conversation.get': async (_params, context) => {
    return getConversation(context.codingAgent, context.conversationId)
  },

  'turn.start': async (params, context) => {
    await startTurn(context.codingAgent, context.conversationId, params)
    return null
  },

  'turn.cancel': async (params, context) => {
    await cancelTurn(context.codingAgent, context.conversationId, params.turnId)
    return null
  },

  'conversation.configuration.set': async (params, context) => {
    await setConversationConfiguration(context.codingAgent, context.conversationId, params)
    return null
  },

  'permission.answer': async (params, context) => {
    await answerPermission(context.codingAgent, context.conversationId, params)
    return null
  },

  'elicitation.answer': async (params, context) => {
    await answerElicitation(context.codingAgent, context.conversationId, params)
    return null
  },
} satisfies ConversationMethodHandlerRegistry
