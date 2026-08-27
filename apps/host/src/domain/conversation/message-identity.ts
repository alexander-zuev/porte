import {
  type ConversationId,
  ElicitationIdSchema,
  type ElicitationId,
  MessageIdSchema,
  type MessageId,
  PermissionIdSchema,
  type PermissionId,
  TurnIdSchema,
  type TurnId,
} from '@porte/core/client'

/**
 * Deterministic ids for what the coding agent does not name (§1: no `messageId`
 * on any chunk). The same transcript maps to the same ids on every load, so the
 * relay can replace its copy without a diff.
 */
export function replayTurnId(conversationId: ConversationId, promptIndex: number): TurnId {
  return TurnIdSchema.parse(`${conversationId}:turn:${String(promptIndex)}`)
}

export function userMessageId(turnId: TurnId): MessageId {
  return MessageIdSchema.parse(`${turnId}:user`)
}

/** `ordinal` counts stream boundaries inside the turn, starting at 1. */
export function assistantMessageId(turnId: TurnId, ordinal: number): MessageId {
  return MessageIdSchema.parse(`${turnId}:assistant:${String(ordinal)}`)
}

export function reasoningMessageId(turnId: TurnId, ordinal: number): MessageId {
  return MessageIdSchema.parse(`${turnId}:reasoning:${String(ordinal)}`)
}

export function permissionId(turnId: TurnId, acpRequestId: string | number): PermissionId {
  return PermissionIdSchema.parse(`${turnId}:permission:${String(acpRequestId)}`)
}

export function elicitationId(turnId: TurnId, acpRequestId: string | number): ElicitationId {
  return ElicitationIdSchema.parse(`${turnId}:elicitation:${String(acpRequestId)}`)
}
