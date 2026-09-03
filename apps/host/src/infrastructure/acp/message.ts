import type { ErrorResponse, SessionNotification, SessionUpdate } from '@agentclientprotocol/sdk'
import { z } from 'zod'

/** JSON value accepted at ACP extension boundaries. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/** JSON-RPC error returned to an ACP peer. */
export type JsonRpcError = ErrorResponse

/** One typed ACP `session/update` value from the official SDK. */
export type AcpSessionUpdate = SessionUpdate

/** One typed ACP `session/update` notification from the official SDK. */
export type AcpSessionNotification = SessionNotification

/**
 * Grok's two extension channels. The end of a turn never arrives on
 * `session/update`: live it is `_x.ai/session_notification`, and inside a
 * `session/load` replay the same frame arrives on `_x.ai/session/update`.
 */
export const GROK_SESSION_NOTIFICATION_METHOD = '_x.ai/session_notification'
export const GROK_SESSION_UPDATE_METHOD = '_x.ai/session/update'
export const GROK_NOTIFICATION_METHODS = [
  GROK_SESSION_NOTIFICATION_METHOD,
  GROK_SESSION_UPDATE_METHOD,
] as const

export type GrokNotificationMethod = (typeof GROK_NOTIFICATION_METHODS)[number]

/** Grok's `turn_completed` frame: the only extension update the Host acts on. */
export const GrokTurnCompletedSchema = z.object({
  sessionId: z.string().min(1),
  update: z.object({
    sessionUpdate: z.literal('turn_completed'),
    stop_reason: z.string(),
    usage: z.object({ totalTokens: z.number().int().nonnegative() }).optional(),
  }),
})

export type GrokTurnCompleted = z.infer<typeof GrokTurnCompletedSchema>
