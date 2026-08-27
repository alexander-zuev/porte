import type {
  CanonicalContent,
  ConversationEvent,
  ConversationId,
  ConversationUsage,
  ElicitationAnswer,
  ElicitationId,
  HostControlMethodMap,
  MessageId,
  PendingElicitation,
  PendingPermission,
  PermissionId,
  TurnId,
} from '@porte/core/client'

/** Outcome of one finished turn, as the relay contract defines it. The ACP adapter maps stop reasons to it. */
export type TurnOutcome = Extract<ConversationEvent, { type: 'turn.finished' }>['outcome']

type InConversation = { conversationId: ConversationId }

/** Payload of every host command by name. One handler per entry, enforced by the registry. */
export type CommandDataMap = {
  // Conversation lifecycle
  CreateConversation: HostControlMethodMap['conversation.create']['params']
  OpenConversation: InConversation & { cwd: string }
  CloseConversation: InConversation
  CloseAllConversations: Record<never, never>

  // Turn
  StartTurn: InConversation & {
    turnId: TurnId
    userMessage: { id: MessageId; content: readonly CanonicalContent[] }
  }
  FinishTurn: InConversation & { turnId: TurnId; outcome: TurnOutcome; usage?: ConversationUsage }
  CancelTurn: InConversation & { turnId: TurnId }
  /** Apply the canonical events the ACP adapter mapped from one `session/update`. */
  ApplyAgentUpdate: InConversation & { events: readonly ConversationEvent[] }

  // Permission
  RequestPermission: InConversation & {
    acpRequestId: string | number
    toolCallId: string
    title: string
    options: PendingPermission['options']
  }
  AnswerPermission: InConversation & {
    turnId: TurnId
    permissionId: PermissionId
    optionId: string
  }

  // Elicitation
  RequestElicitation: InConversation & {
    elicitationId: ElicitationId
    request: PendingElicitation['request']
  }
  AnswerElicitation: InConversation & {
    turnId: TurnId
    elicitationId: ElicitationId
    answer: ElicitationAnswer
  }
  CompleteElicitation: InConversation & { elicitationId: ElicitationId }

  // Configuration
  SetModel: InConversation & { modelId: string }
}
