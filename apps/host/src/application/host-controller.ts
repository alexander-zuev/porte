import { randomUUID } from 'node:crypto'

import {
  RoutedResponseSchema,
  type ApiErrorTag,
  type ClientMethod,
  type ClientMethodMap,
  type RoutedRequest,
} from '@porte/core/client'
import { Result, type Result as ResultType } from 'better-result'

import { HostRelayError, type RelayHandshakeRefused } from './host-error.ts'
import { type CodingAgent, type CodingAgentError } from './ports/coding-agent.ts'
import type { PorteConnection, PorteRelay } from './ports/porte-relay.ts'

/** Summaries per sync frame. Small enough that one slow Mac does not stall the socket. */
const SYNC_CHUNK_SIZE = 500

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
  connect(
    command: ConnectHost,
  ): Promise<ResultType<void, HostRelayError | RelayHandshakeRefused | CodingAgentError>> {
    return this.relay.run({
      ...command,
      handlers: {
        onConnected: (connection) => this.sendConversations(connection),
        onRequest: (request, connection) => this.handle(request, connection),
      },
    })
  }

  /**
   * Give the relay the whole list, a chunk at a time.
   *
   * One epoch for the run, so the relay can tell this sync's rows from the ones
   * left by the last. An empty history still sends one chunk: `done` is what
   * clears whatever the relay is still holding, and a Mac with nothing left has
   * the most to clear.
   */
  private async sendConversations(
    connection: PorteConnection,
  ): Promise<ResultType<void, CodingAgentError>> {
    const listed = await this.agent.listConversations()
    if (listed.isErr()) return Result.err(listed.error)

    const epoch = randomUUID()
    const chunks = intoChunks(listed.value, SYNC_CHUNK_SIZE)
    chunks.forEach((conversations, index) => {
      connection.sendConversationChunk({
        epoch,
        conversations,
        done: index === chunks.length - 1,
      })
    })

    return Result.ok()
  }

  private async handle(
    request: RoutedRequest,
    connection: PorteConnection,
  ): Promise<ResultType<void, CodingAgentError>> {
    const message = request.message
    switch (message.method) {
      case 'conversation.read': {
        const read = await this.agent.readConversation({
          conversationId: message.params.conversationId,
          cursor: message.params.cursor,
          limit: message.params.limit,
        })
        if (read.isErr()) return sendError(request, connection, read.error)
        sendResult(request, connection, {
          conversation: read.value.conversation,
          events: [...read.value.events],
          next: read.value.next,
          turn: read.value.turn,
        })
        return Result.ok()
      }
      case 'conversation.open': {
        const opened = await this.agent.openConversation({
          conversationId: message.params.conversationId,
          onEvent: (event) => {
            connection.sendConversationEvent(event)
          },
        })
        if (opened.isErr()) return sendError(request, connection, opened.error)
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

/**
 * Answer the browser that asked.
 *
 * The result is keyed to the method it answers, so pairing one method's answer
 * with another's shape is a compile error rather than a socket the relay closes.
 */
function sendResult<Method extends ClientMethod>(
  request: RoutedRequest & { message: { method: Method } },
  connection: PorteConnection,
  result: ClientMethodMap[Method]['result'],
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
  const tag = apiErrorTagFor(error.code)
  connection.sendResponse(
    RoutedResponseSchema.parse({
      route: request.route,
      method: request.message.method,
      message: {
        v: 1,
        type: 'error',
        requestId: request.message.requestId,
        error: { _tag: tag, message: publicErrorMessage(tag) },
      },
    }),
  )
  return Result.ok()
}

/** Always at least one chunk: an empty history is a fact the relay has to be told. */
function intoChunks<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [[]]

  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}

/** The agent's own vocabulary, as the published one names the same failure. */
function apiErrorTagFor(code: CodingAgentError['code']): ApiErrorTag {
  if (code === 'CONVERSATION_NOT_FOUND' || code === 'CONVERSATION_NOT_OPEN') {
    return 'ConversationNotFoundError'
  }
  if (code === 'CONVERSATION_BUSY') return 'ConversationBusyError'
  if (code === 'PERMISSION_NOT_FOUND') return 'PermissionNotFoundError'
  return 'InternalServerError'
}

function publicErrorMessage(tag: ApiErrorTag): string {
  if (tag === 'ConversationNotFoundError') return 'Conversation is not open.'
  if (tag === 'ConversationBusyError') return 'Conversation already has an active turn.'
  if (tag === 'PermissionNotFoundError') return 'Permission request is not pending.'
  return 'Coding agent could not complete the request.'
}
