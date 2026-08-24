import { answerElicitation } from '@host/application/commands/answer-elicitation.command.ts'
import { answerPermission } from '@host/application/commands/answer-permission.command.ts'
import { cancelTurn } from '@host/application/commands/cancel-turn.command.ts'
import { closeConversation } from '@host/application/commands/close-conversation.command.ts'
import { setConversationConfiguration } from '@host/application/commands/set-conversation-configuration.command.ts'
import { startTurn } from '@host/application/commands/start-turn.command.ts'
import type { HostApplicationResources } from '@host/application/host-application-resources.ts'
import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import {
  sendEmptyApplicationResult,
  sendInvalidParams,
} from '@host/entrypoints/websocket/websocket-error-boundary.ts'
import type { WebSocketClient } from '@host/infrastructure/websocket/party-socket-client.ts'
import {
  HostConversationMethods,
  HostRequestIdSchema,
  jsonRpcRequestSchema,
  type ConversationId,
  type HostConversationRequestMethod,
  type JsonRpcDocument,
} from '@porte/core/client'

/** Resources available to conversation method handlers. */
export type ConversationMethodContext = {
  readonly conversationId: ConversationId
  readonly controlNotifications: ControlNotifications
  readonly conversationNotifications: ConversationNotifications
  readonly resources: HostApplicationResources
}

/** Handle one parsed conversation method document. */
export type ConversationMethodHandler = (
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ConversationMethodContext,
) => Promise<void>

/** One exhaustive handler for each inbound conversation method. */
export type ConversationMethodHandlerRegistry = Readonly<
  Record<HostConversationRequestMethod, ConversationMethodHandler>
>

/** WebSocket handlers for every inbound conversation method. */
export const CONVERSATION_METHOD_HANDLERS = {
  'conversation.close': handleCloseConversation,
  'turn.start': handleStartTurn,
  'turn.cancel': handleCancelTurn,
  'conversation.configuration.set': handleSetConfiguration,
  'permission.answer': handlePermissionAnswer,
  'elicitation.answer': handleElicitationAnswer,
} satisfies ConversationMethodHandlerRegistry

async function handleCloseConversation(
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ConversationMethodContext,
): Promise<void> {
  const request = jsonRpcRequestSchema(
    'conversation.close',
    HostConversationMethods['conversation.close'].params,
    HostRequestIdSchema,
  ).safeParse(document)
  if (!request.success) {
    invalidParams(socket, document)
    return
  }
  sendEmptyApplicationResult(
    socket,
    request.data.id,
    request.data.method,
    await closeConversation(context.resources.agent, context.conversationId),
  )
}

async function handleStartTurn(
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ConversationMethodContext,
): Promise<void> {
  const request = jsonRpcRequestSchema(
    'turn.start',
    HostConversationMethods['turn.start'].params,
    HostRequestIdSchema,
  ).safeParse(document)
  if (!request.success) {
    invalidParams(socket, document)
    return
  }
  sendEmptyApplicationResult(
    socket,
    request.data.id,
    request.data.method,
    await startTurn(
      context.resources.agent,
      context.resources.catalog,
      context.controlNotifications,
      context.conversationNotifications,
      context.conversationId,
      request.data.params,
    ),
  )
}

async function handleCancelTurn(
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ConversationMethodContext,
): Promise<void> {
  const request = jsonRpcRequestSchema(
    'turn.cancel',
    HostConversationMethods['turn.cancel'].params,
    HostRequestIdSchema,
  ).safeParse(document)
  if (!request.success) {
    invalidParams(socket, document)
    return
  }
  sendEmptyApplicationResult(
    socket,
    request.data.id,
    request.data.method,
    await cancelTurn(context.resources.agent, context.conversationId, request.data.params),
  )
}

async function handleSetConfiguration(
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ConversationMethodContext,
): Promise<void> {
  const request = jsonRpcRequestSchema(
    'conversation.configuration.set',
    HostConversationMethods['conversation.configuration.set'].params,
    HostRequestIdSchema,
  ).safeParse(document)
  if (!request.success) {
    invalidParams(socket, document)
    return
  }
  sendEmptyApplicationResult(
    socket,
    request.data.id,
    request.data.method,
    await setConversationConfiguration(
      context.resources.agent,
      context.conversationId,
      request.data.params,
    ),
  )
}

async function handlePermissionAnswer(
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ConversationMethodContext,
): Promise<void> {
  const request = jsonRpcRequestSchema(
    'permission.answer',
    HostConversationMethods['permission.answer'].params,
    HostRequestIdSchema,
  ).safeParse(document)
  if (!request.success) {
    invalidParams(socket, document)
    return
  }
  sendEmptyApplicationResult(
    socket,
    request.data.id,
    request.data.method,
    await answerPermission(context.resources.agent, context.conversationId, request.data.params),
  )
}

async function handleElicitationAnswer(
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ConversationMethodContext,
): Promise<void> {
  const request = jsonRpcRequestSchema(
    'elicitation.answer',
    HostConversationMethods['elicitation.answer'].params,
    HostRequestIdSchema,
  ).safeParse(document)
  if (!request.success) {
    invalidParams(socket, document)
    return
  }
  sendEmptyApplicationResult(
    socket,
    request.data.id,
    request.data.method,
    await answerElicitation(context.resources.agent, context.conversationId, request.data.params),
  )
}

function invalidParams(socket: WebSocketClient, document: JsonRpcDocument): void {
  sendInvalidParams(socket, 'id' in document && document.id !== undefined ? document.id : null)
}
