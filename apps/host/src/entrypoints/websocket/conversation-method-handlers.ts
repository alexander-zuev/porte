import type { IMessageBus } from '@host/application/message-bus.ts'
import { createCommand, createQuery } from '@host/domain/messages/types.ts'
import { type JsonRpcMethodHandlers } from '@host/entrypoints/websocket/json-rpc-handler.ts'
import {
  ConfigurationNotFoundError,
  HostConversationMethods,
  type ConversationId,
} from '@porte/core/client'

/** Resources available to conversation method handlers. */
export type ConversationMethodContext = {
  readonly conversationId: ConversationId
  readonly bus: IMessageBus
}

/** One exhaustive handler for each inbound conversation request. */
export type ConversationMethodHandlerRegistry = JsonRpcMethodHandlers<
  typeof HostConversationMethods,
  ConversationMethodContext
>

/** Parse → one bus message → answer. No logic lives here. */
export const CONVERSATION_METHOD_HANDLERS = {
  'conversation.close': async (_params, { bus, conversationId }) => {
    await bus.handle(createCommand('CloseConversation', { conversationId }))
    return null
  },

  'conversation.get': (_params, { bus, conversationId }) =>
    bus.handle(createQuery('GetConversation', { conversationId })),

  'turn.start': async (params, { bus, conversationId }) => {
    await bus.handle(createCommand('StartTurn', { conversationId, ...params }))
    return null
  },

  'turn.get': (params, { bus, conversationId }) =>
    bus.handle(createQuery('GetTurn', { conversationId, turnId: params.turnId })),

  'turn.cancel': async (params, { bus, conversationId }) => {
    await bus.handle(createCommand('CancelTurn', { conversationId, turnId: params.turnId }))
    return null
  },

  // Model and effort write through `conversation.model.set`; no other option exists yet.
  'conversation.configuration.set': async () => {
    throw new ConfigurationNotFoundError()
  },

  'conversation.model.set': async (params, { bus, conversationId }) => {
    await bus.handle(createCommand('SetModel', { conversationId, ...params }))
    return null
  },

  'permission.answer': async (params, { bus, conversationId }) => {
    await bus.handle(createCommand('AnswerPermission', { conversationId, ...params }))
    return null
  },

  'elicitation.answer': async (params, { bus, conversationId }) => {
    await bus.handle(createCommand('AnswerElicitation', { conversationId, ...params }))
    return null
  },

  'workspace.changes.list': (_params, { bus, conversationId }) =>
    bus.handle(createQuery('ListWorkspaceChanges', { conversationId })),

  'workspace.changes.get': (params, { bus, conversationId }) =>
    bus.handle(createQuery('GetWorkspaceChange', { conversationId, path: params.path })),
} satisfies ConversationMethodHandlerRegistry
