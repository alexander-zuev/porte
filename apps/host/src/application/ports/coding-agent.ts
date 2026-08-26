import type {
  CanonicalContent,
  ConversationConfigurationValue,
  ConversationCursor,
  ConversationEvent,
  ConversationId,
  ConversationState,
  ConversationSummary,
  ElicitationAnswer,
  ElicitationId,
  ListConversationsResult,
  MessageId,
  PermissionId,
  TurnId,
} from '@porte/core/client'

/** Optional provider capabilities that every Porte coding agent must support. */
export const REQUIRED_CODING_AGENT_CAPABILITIES = [
  'conversation.list',
  'conversation.open',
] as const

export type RequiredCodingAgentCapability = (typeof REQUIRED_CODING_AGENT_CAPABILITIES)[number]

export type StartTurn = {
  readonly turnId: TurnId
  readonly userMessage: {
    readonly id: MessageId
    readonly content: readonly CanonicalContent[]
  }
}

export type SetConfiguration = {
  readonly optionId: string
  readonly value: ConversationConfigurationValue
}

export type AnswerPermission = {
  readonly turnId: TurnId
  readonly permissionId: PermissionId
  readonly optionId: string
}

export type AnswerElicitation = {
  readonly turnId: TurnId
  readonly elicitationId: ElicitationId
  readonly answer: ElicitationAnswer
}

/**
 * One coding-agent process (Grok now; Claude/Gemini later).
 *
 * Application commands talk only to this port. They never see ACP or a child process.
 */
export interface CodingAgent {
  listConversations(cursor?: ConversationCursor): Promise<ListConversationsResult>
  createConversation(cwd: string): Promise<ConversationSummary>
  openConversation(conversationId: ConversationId): Promise<void>
  snapshot(conversationId: ConversationId): ConversationState
  onEvent(conversationId: ConversationId, listener: (event: ConversationEvent) => void): void
  startTurn(conversationId: ConversationId, command: StartTurn): Promise<void>
  cancelTurn(conversationId: ConversationId, turnId: TurnId): Promise<void>
  setConfiguration(conversationId: ConversationId, command: SetConfiguration): Promise<void>
  answerPermission(conversationId: ConversationId, command: AnswerPermission): Promise<void>
  answerElicitation(conversationId: ConversationId, command: AnswerElicitation): Promise<void>
  closeConversation(conversationId: ConversationId): Promise<void>
  closeAll(): Promise<void>
}
