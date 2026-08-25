import type {
  CanonicalContent,
  ConversationConfigurationValue,
  ConversationEmission,
  ConversationId,
  ConversationState,
  ElicitationAnswer,
  ElicitationId,
  MessageId,
  PermissionId,
  TurnId,
} from '@porte/core/client'

export type StartTurn = {
  readonly conversationId: ConversationId
  readonly turnId: TurnId
  readonly userMessage: {
    readonly id: MessageId
    readonly content: readonly CanonicalContent[]
  }
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

/** One active coding-agent conversation and its owned process resources. */
export interface AgentSession {
  readonly conversationId: ConversationId
  readonly state: ConversationState

  setListener(listener: (emission: ConversationEmission) => void): void
  onClose(listener: () => void): void
  startTurn(command: StartTurn): Promise<void>
  cancelTurn(turnId: TurnId): Promise<void>
  setConfiguration(command: SetConfiguration): Promise<void>
  answerPermission(command: AnswerPermission): Promise<void>
  answerElicitation(command: AnswerElicitation): Promise<void>
  close(): Promise<void>
}
