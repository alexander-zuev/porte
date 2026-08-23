import type { ErrorResponse, SessionNotification, SessionUpdate } from '@agentclientprotocol/sdk'

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
