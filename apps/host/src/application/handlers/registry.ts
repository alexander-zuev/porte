import { notImplemented } from './not-implemented.ts'
import type { CommandRegistry, EventRegistry, MessageRegistry, QueryRegistry } from './types.ts'

// Command handlers registry - one handler per command
// `satisfies CommandRegistry` enforces exhaustive CommandName coverage AND that each
// handler's command type matches its slot, so the bus can index it with no boundary cast.
export const COMMAND_HANDLERS = {
  // Conversation lifecycle
  CreateConversation: notImplemented('CreateConversation'),
  OpenConversation: notImplemented('OpenConversation'),
  CloseConversation: notImplemented('CloseConversation'),
  CloseAllConversations: notImplemented('CloseAllConversations'),

  // Turn
  StartTurn: notImplemented('StartTurn'),
  FinishTurn: notImplemented('FinishTurn'),
  CancelTurn: notImplemented('CancelTurn'),
  ApplyAgentUpdate: notImplemented('ApplyAgentUpdate'),

  // Permission
  RequestPermission: notImplemented('RequestPermission'),
  AnswerPermission: notImplemented('AnswerPermission'),

  // Elicitation
  RequestElicitation: notImplemented('RequestElicitation'),
  AnswerElicitation: notImplemented('AnswerElicitation'),
  CompleteElicitation: notImplemented('CompleteElicitation'),

  // Configuration
  SetModel: notImplemented('SetModel'),
} satisfies CommandRegistry

// Event handlers registry - zero or more handlers per event
export const EVENT_HANDLERS = {
  // state: fold into the view store; effect: relay frames. State first, it is synchronous.
  ConversationEventRaised: [],
  // effect: drop the conversation socket
  ConversationClosed: [],
} satisfies EventRegistry

// Query handlers registry - one handler per query
export const QUERY_HANDLERS = {
  ListConversations: notImplemented('ListConversations'),
  GetConversation: notImplemented('GetConversation'),
} satisfies QueryRegistry

export const DEFAULT_REGISTRY: MessageRegistry = {
  commands: COMMAND_HANDLERS,
  events: EVENT_HANDLERS,
  queries: QUERY_HANDLERS,
}
