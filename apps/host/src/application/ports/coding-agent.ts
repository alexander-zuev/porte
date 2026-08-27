import type { ListSessionsResponse } from '@agentclientprotocol/sdk'
import type { Conversation } from '@host/domain/conversation/conversation.ts'
import type {
  CanonicalContent,
  ConversationConfigurationValue,
  ConversationCursor,
  ConversationEvent,
  ConversationId,
  ConversationState,
  ElicitationAnswer,
  ElicitationId,
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

/** Input to create one coding-agent session. `mcpServers` is ACP JSON. */
export type CreateConversation = {
  readonly cwd: string
  readonly mcpServers?: readonly unknown[]
}

/** Facts from a newly created coding-agent session. */
export type CreatedSession = {
  readonly id: ConversationId
}

/**
 * One coding-agent process (Grok now; Claude/Gemini later).
 *
 * List returns the ACP session page. The list query maps it.
 */
export interface CodingAgent {
  listConversations(cursor?: ConversationCursor): Promise<ListSessionsResponse>
  createSession(command: CreateConversation): Promise<CreatedSession>
  hold(conversation: Conversation): void
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
