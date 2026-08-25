import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'

/**
 * These schemas define identifiers that cross Porte process boundaries.
 * Each brand prevents accidental use of a different identifier.
 */
export const HostIdSchema = z.uuidv7().brand<'HostId'>()
export type HostId = z.infer<typeof HostIdSchema>
export const createHostId = (): HostId => HostIdSchema.parse(uuidv7())

/** Minted by Better Auth through `generateId`, which this app sets to uuid v7. */
export const UserIdSchema = z.uuidv7().brand<'UserId'>()
export type UserId = z.infer<typeof UserIdSchema>

export const RequestIdSchema = z.uuidv7().brand<'RequestId'>()
export type RequestId = z.infer<typeof RequestIdSchema>
export const createRequestId = (): RequestId => RequestIdSchema.parse(uuidv7())

export const ConnectionIdSchema = z.uuidv7().brand<'ConnectionId'>()
export type ConnectionId = z.infer<typeof ConnectionIdSchema>
export const createConnectionId = (): ConnectionId => ConnectionIdSchema.parse(uuidv7())

/** Identifier supplied by the client that owns one conversation turn. */
export const TurnIdSchema = z.string().min(1).max(512).brand<'TurnId'>()
export type TurnId = z.infer<typeof TurnIdSchema>
export const createTurnId = (): TurnId => TurnIdSchema.parse(uuidv7())

export const PermissionIdSchema = z.string().min(1).max(1024).brand<'PermissionId'>()
export type PermissionId = z.infer<typeof PermissionIdSchema>
export const createPermissionId = (): PermissionId => PermissionIdSchema.parse(uuidv7())

/** Identifier for one pending elicitation in a conversation. */
export const ElicitationIdSchema = z.string().min(1).max(1024).brand<'ElicitationId'>()

/** Identifier for one pending elicitation in a conversation. */
export type ElicitationId = z.infer<typeof ElicitationIdSchema>

/** Create one time-ordered elicitation identifier. */
export const createElicitationId = (): ElicitationId => ElicitationIdSchema.parse(uuidv7())

export const ConversationIdSchema = z.string().min(1).brand<'ConversationId'>()
export type ConversationId = z.infer<typeof ConversationIdSchema>

export const MessageIdSchema = z.string().min(1).brand<'MessageId'>()
export type MessageId = z.infer<typeof MessageIdSchema>

/** Create one time-ordered message identifier. */
export const createMessageId = (): MessageId => MessageIdSchema.parse(uuidv7())

export const ToolCallIdSchema = z.string().min(1).brand<'ToolCallId'>()
export type ToolCallId = z.infer<typeof ToolCallIdSchema>

export const IsoDateTimeSchema = z.iso.datetime({ offset: true }).brand<'IsoDateTime'>()
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>
