import { createConversation } from '@host/application/commands/create-conversation.command.ts'
import type { HostApplicationResources } from '@host/application/host-application-resources.ts'
import { listConversations } from '@host/application/queries/list-conversations.query.ts'
import type { IHostconectionManager } from '@host/entrypoints/websocket/host-connection-manager'
import {
  sendApplicationResult,
  sendEmptyApplicationResult,
  sendInvalidParams,
} from '@host/entrypoints/websocket/websocket-error-boundary.ts'
import type { WebSocketClient } from '@host/infrastructure/websocket/party-socket-client.ts'
import {
  HostControlMethods,
  HostRequestIdSchema,
  jsonRpcRequestSchema,
  type HostControlRequestMethod,
  type JsonRpcDocument,
} from '@porte/core/client'

/** Resources available to control method handlers. */
export type ControlMethodContext = {
  readonly connections: Pick<IHostconectionManager, 'openConversationConnection'>
  readonly resources: HostApplicationResources
}

/** Handle one parsed control method document. */
export type ControlMethodHandler = (
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ControlMethodContext,
) => Promise<void>

/** One exhaustive handler for each inbound control method. */
export type ControlMethodHandlerRegistry = Readonly<
  Record<HostControlRequestMethod, ControlMethodHandler>
>

/** WebSocket handlers for every inbound control method. */
export const CONTROL_METHOD_HANDLERS = {
  'conversations.list': handleListConversations,
  'conversation.create': handleCreateConversation,
  'conversation.attach': handleAttachConversation,
} satisfies ControlMethodHandlerRegistry

async function handleListConversations(
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ControlMethodContext,
): Promise<void> {
  const request = jsonRpcRequestSchema(
    'conversations.list',
    HostControlMethods['conversations.list'].params,
    HostRequestIdSchema,
  ).safeParse(document)
  if (!request.success) {
    sendInvalidParams(socket, requestId(document))
    return
  }

  sendApplicationResult(
    socket,
    request.data.id,
    request.data.method,
    await listConversations(
      context.resources.agent,
      context.resources.catalog,
      request.data.params,
    ),
  )
}

async function handleCreateConversation(
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ControlMethodContext,
): Promise<void> {
  const request = jsonRpcRequestSchema(
    'conversation.create',
    HostControlMethods['conversation.create'].params,
    HostRequestIdSchema,
  ).safeParse(document)
  if (!request.success) {
    sendInvalidParams(socket, requestId(document))
    return
  }

  sendApplicationResult(
    socket,
    request.data.id,
    request.data.method,
    await createConversation(
      context.resources.agent,
      context.resources.creations,
      context.resources.catalog,
      request.data.params,
    ),
  )
}

async function handleAttachConversation(
  document: JsonRpcDocument,
  socket: WebSocketClient,
  context: ControlMethodContext,
): Promise<void> {
  const request = jsonRpcRequestSchema(
    'conversation.attach',
    HostControlMethods['conversation.attach'].params,
    HostRequestIdSchema,
  ).safeParse(document)
  if (!request.success) {
    sendInvalidParams(socket, requestId(document))
    return
  }

  const connection = context.connections.openConversationConnection(
    request.data.params.conversationId,
  )
  sendEmptyApplicationResult(socket, request.data.id, request.data.method, await connection.ready)
}

function requestId(document: JsonRpcDocument) {
  return 'id' in document && document.id !== undefined ? document.id : null
}
