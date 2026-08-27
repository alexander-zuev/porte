import { answerElicitation } from './answer-elicitation.ts'
import { answerPermission } from './answer-permission.ts'
import { applyAgentUpdate } from './apply-agent-update.ts'
import { cancelTurn } from './cancel-turn.ts'
import { closeAllConversations } from './close-all-conversations.ts'
import { closeConversation } from './close-conversation.ts'
import { completeElicitation } from './complete-elicitation.ts'
import { createConversation } from './create-conversation.ts'
import { dropConversationSocket } from './drop-conversation-socket.ts'
import { finishTurn } from './finish-turn.ts'
import { getConversation } from './get-conversation.ts'
import { listConversations } from './list-conversations.ts'
import { openConversation } from './open-conversation.ts'
import { publishConversationEvent } from './publish-conversation-event.ts'
import { releaseParkedRequest } from './release-parked-request.ts'
import { requestElicitation } from './request-elicitation.ts'
import { requestPermission } from './request-permission.ts'
import { setModel } from './set-model.ts'
import { startTurn } from './start-turn.ts'
import type { CommandRegistry, EventRegistry, MessageRegistry, QueryRegistry } from './types.ts'

// Command handlers registry - one handler per command
// `satisfies CommandRegistry` enforces exhaustive CommandName coverage AND that each
// handler's command type matches its slot, so the bus can index it with no boundary cast.
export const COMMAND_HANDLERS = {
  // Conversation lifecycle
  CreateConversation: createConversation,
  OpenConversation: openConversation,
  CloseConversation: closeConversation,
  CloseAllConversations: closeAllConversations,

  // Turn
  StartTurn: startTurn,
  FinishTurn: finishTurn,
  CancelTurn: cancelTurn,
  ApplyAgentUpdate: applyAgentUpdate,

  // Permission
  RequestPermission: requestPermission,
  AnswerPermission: answerPermission,

  // Elicitation
  RequestElicitation: requestElicitation,
  AnswerElicitation: answerElicitation,
  CompleteElicitation: completeElicitation,

  // Configuration
  SetModel: setModel,
} satisfies CommandRegistry

// Event handlers registry - zero or more handlers per event. All effects: the
// aggregate is already saved when these run.
export const EVENT_HANDLERS = {
  ConversationEventRaised: [publishConversationEvent, releaseParkedRequest],
  ConversationClosed: [dropConversationSocket],
} satisfies EventRegistry

// Query handlers registry - one handler per query
export const QUERY_HANDLERS = {
  ListConversations: listConversations,
  GetConversation: getConversation,
} satisfies QueryRegistry

export const DEFAULT_REGISTRY: MessageRegistry = {
  commands: COMMAND_HANDLERS,
  events: EVENT_HANDLERS,
  queries: QUERY_HANDLERS,
}
