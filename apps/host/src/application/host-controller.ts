import {
  IsoDateTimeSchema,
  RoutedResponseSchema,
  createEventId,
  type ClientMethodMap,
  type DaemonMethod,
  type RoutedRequest,
} from '@porte/core'
import { ConversationEventSchema } from '@porte/core/conversation-event'
import { Result, type Result as ResultType } from 'better-result'

import { HostRelayError } from './host-error.ts'
import {
  type CodingAgent,
  type CodingAgentError,
  type ConversationSnapshot,
} from './ports/coding-agent.ts'
import type { PorteConnection, PorteRelay } from './ports/porte-relay.ts'

export type ConnectHost = {
  readonly relayUrl: string
  readonly token: string
  readonly signal: AbortSignal
}

/** Routes Porte requests to one configured coding agent. */
export class HostController {
  constructor(
    private readonly agent: CodingAgent,
    private readonly relay: PorteRelay,
  ) {}

  /** Connect the host and handle requests until the signal stops. */
  connect(command: ConnectHost): Promise<ResultType<void, HostRelayError | CodingAgentError>> {
    return this.relay.run({
      ...command,
      handlers: {
        onConnected: (connection) => this.sendConversations(connection),
        onRequest: (request, connection) => this.handle(request, connection),
      },
    })
  }

  private async sendConversations(
    connection: PorteConnection,
  ): Promise<ResultType<void, CodingAgentError>> {
    const listed = await this.agent.listConversations()
    if (listed.isErr()) return Result.err(listed.error)
    connection.sendConversations({
      state: 'synced',
      conversations: listed.value,
      observedAt: IsoDateTimeSchema.parse(new Date().toISOString()),
    })
    return Result.ok()
  }

  private async handle(
    request: RoutedRequest,
    connection: PorteConnection,
  ): Promise<ResultType<void, CodingAgentError>> {
    const message = request.message
    switch (message.method) {
      case 'conversation.open': {
        const opened = await this.agent.openConversation({
          conversationId: message.params.conversationId,
          onEvent: (event) => {
            connection.sendConversationEvent(event)
          },
        })
        if (opened.isErr()) return sendError(request, connection, opened.error)
        sendSnapshot(connection, opened.value)
        sendResult(request, connection, {
          conversation: opened.value.summary,
          turn: { state: 'idle' },
        })
        return Result.ok()
      }
      case 'conversation.create': {
        const created = await this.agent.createConversation({
          cwd: message.params.cwd,
          onEvent: (event) => {
            connection.sendConversationEvent(event)
          },
        })
        if (created.isErr()) return sendError(request, connection, created.error)
        sendSnapshot(connection, created.value)
        sendResult(request, connection, { conversation: created.value.summary })
        return Result.ok()
      }
      case 'conversation.close': {
        const closed = await this.agent.closeConversation(message.params.conversationId)
        if (closed.isErr()) return sendError(request, connection, closed.error)
        sendResult(request, connection, {})
        return Result.ok()
      }
      case 'turn.start': {
        const started = await this.agent.startTurn({
          conversationId: message.params.conversationId,
          turnId: message.params.turnId,
          prompt: message.params.prompt,
        })
        if (started.isErr()) return sendError(request, connection, started.error)
        sendResult(request, connection, { turnId: message.params.turnId })
        return Result.ok()
      }
      case 'turn.cancel': {
        const cancelled = await this.agent.cancelTurn({
          conversationId: message.params.conversationId,
          turnId: message.params.turnId,
        })
        if (cancelled.isErr()) return sendError(request, connection, cancelled.error)
        sendResult(request, connection, { turnId: message.params.turnId })
        return Result.ok()
      }
      case 'permission.answer': {
        const answered = await this.agent.answerPermission({
          conversationId: message.params.conversationId,
          turnId: message.params.turnId,
          permissionId: message.params.permissionId,
          optionId: message.params.optionId,
        })
        if (answered.isErr()) return sendError(request, connection, answered.error)
        sendResult(request, connection, { permissionId: message.params.permissionId })
        return Result.ok()
      }
    }
    const exhaustive: never = message
    return exhaustive
  }
}

function sendSnapshot(connection: PorteConnection, snapshot: ConversationSnapshot): void {
  connection.sendConversationEvent(
    ConversationEventSchema.parse({
      eventId: createEventId(),
      sessionId: snapshot.summary.id,
      type: 'conversation.snapshot',
      view: snapshot.view,
    }),
  )
}

function sendResult(
  request: RoutedRequest,
  connection: PorteConnection,
  result: ClientMethodMap[DaemonMethod]['result'],
): void {
  connection.sendResponse(
    RoutedResponseSchema.parse({
      route: request.route,
      method: request.message.method,
      message: {
        v: 1,
        type: 'result',
        requestId: request.message.requestId,
        result,
      },
    }),
  )
}

function sendError(
  request: RoutedRequest,
  connection: PorteConnection,
  error: CodingAgentError,
): ResultType<void, CodingAgentError> {
  const code =
    error.code === 'CONVERSATION_NOT_FOUND' || error.code === 'CONVERSATION_NOT_OPEN'
      ? 'CONVERSATION_NOT_FOUND'
      : error.code === 'CONVERSATION_BUSY'
        ? 'CONVERSATION_BUSY'
        : error.code === 'PERMISSION_NOT_FOUND'
          ? 'PERMISSION_NOT_FOUND'
          : 'INTERNAL_ERROR'
  connection.sendResponse(
    RoutedResponseSchema.parse({
      route: request.route,
      method: request.message.method,
      message: {
        v: 1,
        type: 'error',
        requestId: request.message.requestId,
        error: { code, message: publicErrorMessage(code) },
      },
    }),
  )
  return Result.ok()
}

function publicErrorMessage(code: string): string {
  if (code === 'CONVERSATION_NOT_FOUND') return 'Conversation is not open.'
  if (code === 'CONVERSATION_BUSY') return 'Conversation already has an active turn.'
  if (code === 'PERMISSION_NOT_FOUND') return 'Permission request is not pending.'
  return 'Coding agent could not complete the request.'
}
