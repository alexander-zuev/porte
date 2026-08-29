import type { TurnOutcome } from '@host/domain/conversation/conversation.ts'
import type {
  AttemptId,
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
  /** The Host mints the turn id; `attemptId` makes a repeated request a no-op. */
  StartTurn: InConversation & {
    attemptId: AttemptId
    userMessage: { id: MessageId; content: readonly CanonicalContent[] }
  }
  FinishTurn: InConversation & { turnId: TurnId; outcome: TurnOutcome; usage?: ConversationUsage }
  CancelTurn: InConversation & { turnId: TurnId }
  /** The cancel deadline fired; close the session and finish the turn if it still runs. */
  ExpireCancel: InConversation & { turnId: TurnId }
  /** Apply the canonical events the ACP adapter mapped from one `session/update`. */
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
  SetModel: InConversation & { modelId: string }
}
