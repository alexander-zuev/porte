import type {
  PermissionId,
  ConversationId as ProtocolConversationId,
  ConversationSummary as ProtocolConversationSummary,
  TurnId,
} from '@porte/core'
import type {
  ConversationEvent as ProtocolConversationEvent,
  ConversationView as ProtocolConversationView,
} from '@porte/core/conversation-event'
import { TaggedError, type Result } from 'better-result'

/** Porte identifier for one persisted agent conversation. */
export type ConversationId = ProtocolConversationId

/** Provider-independent summary for one persisted conversation. */
export type ConversationSummary = ProtocolConversationSummary

/** Provider-independent event from one conversation. */
export type ConversationEvent = ProtocolConversationEvent

/** Complete state returned when Porte opens a conversation. */
export type ConversationSnapshot = {
  readonly summary: ConversationSummary
  readonly view: ProtocolConversationView
}

/** A provider could not complete one coding-agent operation. */
export class CodingAgentError extends TaggedError('CodingAgentError')<{
  code:
    | 'CONVERSATION_NOT_FOUND'
    | 'CONVERSATION_NOT_OPEN'
    | 'CONVERSATION_BUSY'
    | 'PERMISSION_NOT_FOUND'
    | 'PROVIDER_UNAVAILABLE'
    | 'INVALID_PROVIDER_RESPONSE'
  operation:
    | 'list'
    | 'open'
    | 'create'
    | 'close'
    | 'start_turn'
    | 'cancel_turn'
    | 'answer_permission'
  cause: unknown
  message: string
}> {}

export type OpenConversation = {
  readonly conversationId: ConversationId
  readonly onEvent: (event: ConversationEvent) => void
}

export type CreateConversation = {
  readonly cwd: string
  readonly onEvent: (event: ConversationEvent) => void
}

export type StartTurn = {
  readonly conversationId: ConversationId
  readonly turnId: TurnId
  readonly prompt: string
}

export type CancelTurn = {
  readonly conversationId: ConversationId
  readonly turnId: TurnId
}

export type AnswerPermission = {
  readonly conversationId: ConversationId
  readonly turnId: TurnId
  readonly permissionId: PermissionId
  readonly optionId: string
}

/** Provider-independent control surface for one installed coding agent. */
export interface CodingAgent {
  /** List persisted conversations in display order. */
  listConversations(): Promise<Result<ConversationSummary[], CodingAgentError>>

  /** Open one persisted conversation and load its complete state. */
  openConversation(
    command: OpenConversation,
  ): Promise<Result<ConversationSnapshot, CodingAgentError>>

  /** Create one conversation and return its complete initial state. */
  createConversation(
    command: CreateConversation,
  ): Promise<Result<ConversationSnapshot, CodingAgentError>>

  /** Close one open conversation and stop its provider resources. */
  closeConversation(conversationId: ConversationId): Promise<Result<void, CodingAgentError>>

  /** Accept one turn for an open conversation. */
  startTurn(command: StartTurn): Promise<Result<void, CodingAgentError>>

  /** Cancel the active turn for one conversation. */
  cancelTurn(command: CancelTurn): Promise<Result<void, CodingAgentError>>

  /** Answer one pending permission request. */
  answerPermission(command: AnswerPermission): Promise<Result<void, CodingAgentError>>
}
