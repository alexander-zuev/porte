import type { HostOperationError } from '@host/application/host-operation-error.ts'
import type { CodingAgentError } from '@host/application/ports/coding-agent.ts'
import { ConversationConnectionUnavailableError } from '@host/entrypoints/websocket/websocket-errors.ts'
import type { WebSocketClient } from '@host/infrastructure/websocket/party-socket-client.ts'
import {
  createLogger,
  decodeJsonRpc,
  HOST_APPLICATION_ERROR_CODE,
  HOST_APPLICATION_ERROR_MESSAGE,
  jsonRpcError,
  jsonRpcResult,
  JSON_RPC_ERROR_CODES,
  type HostRequestId,
  type JsonRpcDocument,
  type JsonRpcId,
  type JsonRpcResponse,
  type PorteErrorPayload,
} from '@porte/core/client'
import type { Result } from 'better-result'
import { z } from 'zod'

const MAX_MESSAGE_BYTES = 1024 * 1024
const InboundFrameSchema = z
  .string()
  .refine((value) => Buffer.byteLength(value) <= MAX_MESSAGE_BYTES)
const logger = createLogger('host-websocket')

/** Every expected error one WebSocket request can return. */
export type WebSocketRequestError = HostOperationError | ConversationConnectionUnavailableError

/** Parse one WebSocket message into a JSON-RPC document. */
export function parseWebSocketMessage(
  event: MessageEvent,
  socket: WebSocketClient,
): JsonRpcDocument | undefined {
  const frame = InboundFrameSchema.safeParse(event.data)
  if (!frame.success) {
    sendProtocolError(socket, null, JSON_RPC_ERROR_CODES.invalidRequest, 'Invalid Request')
    return undefined
  }

  const decoded = decodeJsonRpc(frame.data)
  if (decoded.isErr()) {
    sendProtocolError(socket, null, decoded.error.code, decoded.error.message)
    return undefined
  }
  return decoded.value
}

/** Send one successful or failed application result. */
export function sendApplicationResult<Value>(
  socket: WebSocketClient,
  id: HostRequestId,
  method: string,
  result: Result<Value, WebSocketRequestError>,
): void {
  const response = result.isErr()
    ? jsonRpcError(
        id,
        HOST_APPLICATION_ERROR_CODE,
        HOST_APPLICATION_ERROR_MESSAGE,
        toErrorPayload(method, result.error),
      )
    : jsonRpcResult(id, result.value)
  send(socket, response, 'response send failed')
}

/** Send one successful or failed application result with a null success value. */
export function sendEmptyApplicationResult(
  socket: WebSocketClient,
  id: HostRequestId,
  method: string,
  result: Result<void, WebSocketRequestError>,
): void {
  const response = result.isErr()
    ? jsonRpcError(
        id,
        HOST_APPLICATION_ERROR_CODE,
        HOST_APPLICATION_ERROR_MESSAGE,
        toErrorPayload(method, result.error),
      )
    : jsonRpcResult(id, null)
  send(socket, response, 'response send failed')
}

/** Send an invalid-parameters response. */
export function sendInvalidParams(socket: WebSocketClient, id: JsonRpcId): void {
  sendProtocolError(socket, id, JSON_RPC_ERROR_CODES.invalidParams, 'Invalid params')
}

/** Send a JSON-RPC protocol error. */
export function sendProtocolError(
  socket: WebSocketClient,
  id: JsonRpcId,
  code: number,
  message: string,
): void {
  send(socket, jsonRpcError(id, code, message), 'protocol response send failed')
}

function send(
  socket: WebSocketClient,
  document: JsonRpcResponse<unknown, unknown>,
  reason: string,
): void {
  if (!socket.send(JSON.stringify(document))) socket.reconnect(1011, reason)
}

function toErrorPayload(method: string, error: WebSocketRequestError): PorteErrorPayload {
  logRequestError(method, error)
  if (error instanceof ConversationConnectionUnavailableError) {
    return { _tag: 'ConversationNotFoundError', message: 'Conversation connection was refused.' }
  }
  if (error._tag === 'StaleConversationCursorError') {
    return {
      _tag: 'ValidationError',
      message: 'Conversation cursor is stale.',
      issues: [{ path: ['cursor'], message: error.message }],
    }
  }
  if (error._tag === 'ConversationCreationConflictError') {
    return { _tag: 'OperationConflictError', message: error.message }
  }
  if (error._tag === 'ConversationCreationStoreError') {
    return { _tag: 'InternalServerError', message: 'Porte could not save the conversation.' }
  }
  return codingAgentErrorPayload(error)
}

function logRequestError(method: string, error: WebSocketRequestError): void {
  const cause = 'cause' in error ? error.cause : error
  const code = 'code' in error ? error.code : error._tag
  logger.error('host_method_failed', { error: cause, details: { method, code } })
}

function codingAgentErrorPayload(error: CodingAgentError): PorteErrorPayload {
  if (error.code === 'CONVERSATION_NOT_FOUND' || error.code === 'CONVERSATION_NOT_OPEN') {
    return { _tag: 'ConversationNotFoundError', message: 'Conversation is not open.' }
  }
  if (error.code === 'CONVERSATION_BUSY') {
    return { _tag: 'ConversationBusyError', message: 'Conversation already has an active turn.' }
  }
  if (error.code === 'PERMISSION_NOT_FOUND') {
    return { _tag: 'PermissionNotFoundError', message: 'Permission request is not pending.' }
  }
  if (error.code === 'ELICITATION_NOT_FOUND') {
    return { _tag: 'ElicitationNotFoundError', message: 'Elicitation is not pending.' }
  }
  if (error.code === 'CONFIGURATION_NOT_FOUND') {
    return { _tag: 'ConfigurationNotFoundError', message: 'Configuration option is not available.' }
  }
  if (error.code === 'NOT_A_REPOSITORY') {
    return { _tag: 'WorkspaceNotAllowedError', message: 'That folder is not a repository.' }
  }
  if (error.code === 'PROVIDER_UNAVAILABLE') {
    return { _tag: 'GrokUnavailableError', message: 'Grok is not available.' }
  }
  return { _tag: 'InternalServerError', message: 'Coding agent could not complete the request.' }
}
