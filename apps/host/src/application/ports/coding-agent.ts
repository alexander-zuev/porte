import type {
  ConversationTurnState,
  ConversationStateSnapshot,
  ConversationEmission,
  CanonicalContent,
  FailureClassification,
  MessageId,
  PermissionId,
  ConversationIdentity as ProtocolConversationIdentity,
  ConversationId as ProtocolConversationId,
  ConversationSummary as ProtocolConversationSummary,
  TurnId,
  ActiveConversationTurn,
  ConversationTranscript as ProtocolConversationTranscript,
  ReadConversation as ProtocolReadConversation,
} from '@porte/core/client'
import type { ConversationEvent as ProtocolConversationEvent } from '@porte/core/client'
import { TaggedError, type Result } from 'better-result'

/** Porte identifier for one persisted agent conversation. */
export type ConversationId = ProtocolConversationId

/** Provider-independent summary for one persisted conversation. */
export type ConversationSummary = ProtocolConversationSummary

/** What every answer about one conversation names it by. */
export type ConversationIdentity = ProtocolConversationIdentity

/** Whether a conversation is running a turn right now. */
export type { ConversationTurnState }

/** Provider-independent event from one conversation. */
export type ConversationEvent = ProtocolConversationEvent
export type { ConversationEmission }

/**
 * Complete state returned when Porte opens a conversation.
 *
 * Identity, not a summary: opening reads stored files, and no stored file says
 * which repository the conversation belongs to.
 */
export type ConversationSnapshot = {
  readonly summary: ConversationIdentity
  readonly state: ConversationStateSnapshot
}

/** Complete state returned when Porte creates one. The repository is known here. */
export type CreatedConversation = {
  readonly summary: ConversationSummary
  readonly state: ConversationStateSnapshot
}

/** What went wrong, in the provider-independent words the CLI and relay use. */
export type CodingAgentFailure =
  | 'CONVERSATION_NOT_FOUND'
  | 'CONVERSATION_NOT_OPEN'
  | 'CONVERSATION_BUSY'
  | 'PERMISSION_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_PROVIDER_RESPONSE'
  /** The caller named a directory outside any repository, which cannot be listed. */
  | 'NOT_A_REPOSITORY'

/** Which call it went wrong in. */
export type CodingAgentOperation =
  | 'list'
  | 'read'
  | 'open'
  | 'create'
  | 'close'
  | 'start_turn'
  | 'cancel_turn'
  | 'answer_permission'

/** Only a busy conversation and an absent provider may answer differently later. */
const CLASSIFICATIONS = {
  CONVERSATION_NOT_FOUND: 'terminal',
  CONVERSATION_NOT_OPEN: 'terminal',
  CONVERSATION_BUSY: 'transient',
  PERMISSION_NOT_FOUND: 'terminal',
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

export type ReadConversation = ProtocolReadConversation

/** One page of a stored transcript, newest turn last. */
export type ConversationTranscript = ProtocolConversationTranscript

export type OpenConversation = {
  readonly conversationId: ConversationId
  readonly onEvent: (emission: ConversationEmission) => void
}

export type CreateConversation = {
  readonly cwd: string
  readonly onEvent: (emission: ConversationEmission) => void
}

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

  /** List turns that this host process still owns. */
  activeTurns(): readonly ActiveConversationTurn[]

  /** Read one stored conversation without starting an agent process. */
  readConversation(
    command: ReadConversation,
  ): Promise<Result<ConversationTranscript, CodingAgentError>>

  /** Open one persisted conversation and load its complete state. */
  openConversation(
    command: OpenConversation,
  ): Promise<Result<ConversationSnapshot, CodingAgentError>>

  /** Create one conversation and return its complete initial state. */
  createConversation(
    command: CreateConversation,
  ): Promise<Result<CreatedConversation, CodingAgentError>>

  /** Close one open conversation and stop its provider resources. */
  closeConversation(conversationId: ConversationId): Promise<Result<void, CodingAgentError>>

  /** Accept one turn for an open conversation. */
  startTurn(command: StartTurn): Promise<Result<void, CodingAgentError>>

  /** Cancel the active turn for one conversation. */
  cancelTurn(command: CancelTurn): Promise<Result<void, CodingAgentError>>

  /** Answer one pending permission request. */
  answerPermission(command: AnswerPermission): Promise<Result<void, CodingAgentError>>
}
