import type {
  CanonicalContent,
  Conversation,
  ConversationConfigurationValue,
  ConversationEmission,
  ConversationEvent,
  ConversationId as ProtocolConversationId,
  ConversationState,
  ElicitationAnswer,
  ElicitationId,
  FailureClassification,
  MessageId,
  PermissionId,
  TurnId,
} from '@porte/core/client'
import { TaggedError, type Result } from 'better-result'

/** Porte identifier for one persisted coding-agent conversation. */
export type ConversationId = ProtocolConversationId

/** Provider-independent event from one conversation. */
export type { ConversationEmission, ConversationEvent }

/** What went wrong, in the provider-independent words the Host uses. */
export type CodingAgentFailure =
  | 'CONVERSATION_NOT_FOUND'
  | 'CONVERSATION_NOT_OPEN'
  | 'CONVERSATION_BUSY'
  | 'PERMISSION_NOT_FOUND'
  | 'ELICITATION_NOT_FOUND'
  | 'CONFIGURATION_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_PROVIDER_RESPONSE'
  | 'NOT_A_REPOSITORY'

/** The coding-agent operation that failed. */
export type CodingAgentOperation =
  | 'list'
  | 'open'
  | 'create'
  | 'close'
  | 'start_turn'
  | 'cancel_turn'
  | 'set_configuration'
  | 'answer_permission'
  | 'answer_elicitation'

const CLASSIFICATIONS = {
  CONVERSATION_NOT_FOUND: 'terminal',
  CONVERSATION_NOT_OPEN: 'terminal',
  CONVERSATION_BUSY: 'transient',
  PERMISSION_NOT_FOUND: 'terminal',
  ELICITATION_NOT_FOUND: 'terminal',
  CONFIGURATION_NOT_FOUND: 'terminal',
  PROVIDER_UNAVAILABLE: 'transient',
  INVALID_PROVIDER_RESPONSE: 'terminal',
  NOT_A_REPOSITORY: 'terminal',
} satisfies Record<CodingAgentFailure, FailureClassification>

/** A provider could not complete one coding-agent operation. */
export class CodingAgentError extends TaggedError('CodingAgentError')<{
  code: CodingAgentFailure
  operation: CodingAgentOperation
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: {
    code: CodingAgentFailure
    operation: CodingAgentOperation
    cause: unknown
    message: string
  }) {
    super({ ...args, classification: CLASSIFICATIONS[args.code] })
  }
}

export type OpenConversation = {
  readonly conversationId: ConversationId
  readonly onEvent: (emission: ConversationEmission) => void
}

export type CreateConversation = { readonly cwd: string }

export type StartTurn = {
  readonly conversationId: ConversationId
  readonly turnId: TurnId
  readonly userMessage: {
    readonly id: MessageId
    readonly content: readonly CanonicalContent[]
  }
}

export type CancelTurn = {
  readonly conversationId: ConversationId
  readonly turnId: TurnId
}

export type SetConfiguration = {
  readonly conversationId: ConversationId
  readonly optionId: string
  readonly value: ConversationConfigurationValue
}

export type AnswerPermission = {
  readonly conversationId: ConversationId
  readonly turnId: TurnId
  readonly permissionId: PermissionId
  readonly optionId: string
}

export type AnswerElicitation = {
  readonly conversationId: ConversationId
  readonly turnId: TurnId
  readonly elicitationId: ElicitationId
  readonly answer: ElicitationAnswer
}

/** Provider-independent control surface for one installed coding agent. */
export interface CodingAgent {
  listConversations(): Promise<Result<Conversation[], CodingAgentError>>
  openConversation(command: OpenConversation): Promise<Result<ConversationState, CodingAgentError>>
  createConversation(command: CreateConversation): Promise<Result<Conversation, CodingAgentError>>
  closeConversation(conversationId: ConversationId): Promise<Result<void, CodingAgentError>>
  startTurn(command: StartTurn): Promise<Result<void, CodingAgentError>>
  cancelTurn(command: CancelTurn): Promise<Result<void, CodingAgentError>>
  setConfiguration(command: SetConfiguration): Promise<Result<void, CodingAgentError>>
  answerPermission(command: AnswerPermission): Promise<Result<void, CodingAgentError>>
  answerElicitation(command: AnswerElicitation): Promise<Result<void, CodingAgentError>>
}
