import type {
  AttemptId,
  CanonicalContent,
  ConversationEvent,
  ConversationId,
  ElicitationAnswer,
  ElicitationId,
  HostControlMethodMap,
  MessageId,
  PendingElicitation,
  PendingPermission,
  PermissionId,
  TurnId,
} from '@porte/core/client'

type InConversation = { conversationId: ConversationId }

/** Payload of every host command by name. One handler per entry, enforced by the registry. */
export type CommandDataMap = {
  // Conversation lifecycle
  CreateConversation: HostControlMethodMap['conversation.create']['params']
  OpenConversation: InConversation & { cwd: string }
  CloseConversation: InConversation
  CloseAllConversations: Record<never, never>
  /** Close a conversation with no running turn inside the idle window; a viewer re-attaches later. */
  CloseIdleConversation: InConversation

  // Turn
  /** Send a prompt; answers with the turn Grok started for it. `attemptId` makes a repeat a no-op. */
  StartTurn: InConversation & {
    attemptId: AttemptId
    userMessage: { id: MessageId; content: readonly CanonicalContent[] }
  }
  CancelTurn: InConversation & { turnId: TurnId }
  /** The cancel deadline fired; end the turn here if it still runs. */
  ExpireCancel: InConversation & { turnId: TurnId }
  /** Apply the canonical events the ACP adapter mapped from Grok's stream, turn boundaries included. */
  ApplyAgentUpdate: InConversation & { events: readonly ConversationEvent[] }

  // Permission
  RequestPermission: InConversation & Omit<PendingPermission, 'turnId'>
  AnswerPermission: InConversation & {
    turnId: TurnId
    permissionId: PermissionId
    optionId: string
  }

  // Elicitation
  RequestElicitation: InConversation & Omit<PendingElicitation, 'turnId'>
  AnswerElicitation: InConversation & {
    turnId: TurnId
    elicitationId: ElicitationId
    answer: ElicitationAnswer
  }
  CompleteElicitation: InConversation & { elicitationId: ElicitationId }

  // Configuration
  SetModel: InConversation & { modelId: string; reasoningEffort?: string }
}
