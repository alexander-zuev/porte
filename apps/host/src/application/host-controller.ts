import { HostRelayError, type RelayHandshakeRefused } from '@host/application/host-error.ts'
import { type CodingAgent, type CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type { PorteConnection, PorteRelay } from '@host/application/ports/porte-relay.ts'
import {
  createLogger,
  type DomainErrorTag,
  type HostCommand,
  type HostCommandError,
  type HostCommandMethod,
  type HostCommandResponse,
  type OperationId,
} from '@porte/core/client'
import { Result, type Result as ResultType } from 'better-result'

const logger = createLogger('host-controller')
const SYNC_CHUNK_SIZE = 500

export type ConnectHost = {
  readonly relayUrl: string
  readonly token: string
  readonly signal: AbortSignal
}

/** Routes relay commands to one configured coding agent. */
export class HostController {
  constructor(
    private readonly agent: CodingAgent,
    private readonly relay: PorteRelay,
  ) {}

  /** Connects the host and handles commands until the signal stops. */
  connect(
    command: ConnectHost,
  ): Promise<ResultType<void, HostRelayError | RelayHandshakeRefused | CodingAgentError>> {
    return this.relay.run({
      ...command,
      handlers: {
        onConnected: async () => Result.ok(),
        onCommand: (hostCommand, connection) => this.handle(hostCommand, connection),
      },
    })
  }

  private async handle(
    command: HostCommand,
    connection: PorteConnection,
  ): Promise<ResultType<void, CodingAgentError>> {
    switch (command.method) {
      case 'conversations.sync': {
        const synced = await this.sendConversations(command.operationId, connection)
        if (synced.isErr()) return sendError(command, connection, synced.error)
        connection.sendCommandResponse(
          commandResult(command.operationId, { eventHeads: connection.eventHeads() }),
        )
        return Result.ok()
      }

      case 'conversation.read': {
        const read = await this.agent.readConversation(command.params)
        if (read.isErr()) return sendError(command, connection, read.error)
        connection.sendCommandResponse(
          commandResult(command.operationId, {
            conversation: read.value.conversation,
            events: [...read.value.events],
            next: read.value.next,
            state: read.value.state,
          }),
        )
        return Result.ok()
      }

      case 'conversation.create': {
        const created = await this.agent.createConversation({
          cwd: command.params.cwd,
          onEvent: (emission) => {
            connection.sendConversationEvent(emission)
          },
        })
        if (created.isErr()) return sendError(command, connection, created.error)
        connection.sendConversationSnapshot(created.value.summary.id, created.value.state)
        connection.sendConversationSummary(created.value.summary)
        connection.sendCommandResponse(
          commandResult(command.operationId, { conversation: created.value.summary }),
        )
        return Result.ok()
      }

      case 'turn.start': {
        const opened = await this.agent.openConversation({
          conversationId: command.params.conversationId,
          onEvent: (emission) => {
            connection.sendConversationEvent(emission)
          },
        })
        if (opened.isErr()) return sendError(command, connection, opened.error)
        connection.sendConversationSnapshot(command.params.conversationId, opened.value.state)

        const started = await this.agent.startTurn(command.params)
        if (started.isErr()) return sendError(command, connection, started.error)
        connection.sendCommandResponse(
          commandResult(command.operationId, { turnId: command.params.turnId }),
        )
        return Result.ok()
      }

      case 'turn.cancel': {
        const cancelled = await this.agent.cancelTurn(command.params)
        if (cancelled.isErr()) return sendError(command, connection, cancelled.error)
        connection.sendCommandResponse(
          commandResult(command.operationId, { turnId: command.params.turnId }),
        )
        return Result.ok()
      }

      case 'permission.answer': {
        const answered = await this.agent.answerPermission(command.params)
        if (answered.isErr()) return sendError(command, connection, answered.error)
        connection.sendCommandResponse(
          commandResult(command.operationId, { permissionId: command.params.permissionId }),
        )
        return Result.ok()
      }
    }

    return command satisfies never
  }

  private async sendConversations(
    operationId: OperationId,
    connection: PorteConnection,
  ): Promise<ResultType<void, CodingAgentError>> {
    const listed = await this.agent.listConversations()
    if (listed.isErr()) return Result.err(listed.error)

    const chunks = intoChunks(listed.value, SYNC_CHUNK_SIZE)
    chunks.forEach((conversations, index) => {
      const done = index === chunks.length - 1
      connection.sendConversationChunk(
        operationId,
        done
          ? { conversations, done: true, activeTurns: [...this.agent.activeTurns()] }
          : { conversations, done: false },
      )
    })
    return Result.ok()
  }
}

function commandResult<Method extends HostCommandMethod>(
  operationId: OperationId,
  result: Extract<HostCommandResponse<Method>, { type: 'command.result' }>['result'],
): HostCommandResponse<Method> {
  return { v: 2, type: 'command.result', operationId, result }
}

function sendError(
  command: HostCommand,
  connection: PorteConnection,
  error: CodingAgentError,
): ResultType<void, CodingAgentError> {
  logger.error('command_failed', {
    error: error.cause ?? error,
    details: { method: command.method, code: error.code, operation: error.operation },
  })
  connection.sendCommandResponse({
    v: 2,
    type: 'command.error',
    operationId: command.operationId,
    error: publicPorteErrorPayload(error),
  })
  return Result.ok()
}

function publicPorteErrorPayload(error: CodingAgentError): HostCommandError['error'] {
  const tag = domainErrorTagFor(error.code)
  return { _tag: tag, message: errorPayloadMessage(tag) }
}

function intoChunks<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [[]]
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}

type HostDomainErrorTag = Exclude<DomainErrorTag, 'ValidationError'>

function domainErrorTagFor(code: CodingAgentError['code']): HostDomainErrorTag {
  if (code === 'CONVERSATION_NOT_FOUND' || code === 'CONVERSATION_NOT_OPEN') {
    return 'ConversationNotFoundError'
  }
  if (code === 'CONVERSATION_BUSY') return 'ConversationBusyError'
  if (code === 'PERMISSION_NOT_FOUND') return 'PermissionNotFoundError'
  if (code === 'NOT_A_REPOSITORY') return 'WorkspaceNotAllowedError'
  return 'InternalServerError'
}

function errorPayloadMessage(tag: HostDomainErrorTag): string {
  if (tag === 'ConversationNotFoundError') return 'Conversation is not open.'
  if (tag === 'ConversationBusyError') return 'Conversation already has an active turn.'
  if (tag === 'PermissionNotFoundError') return 'Permission request is not pending.'
  if (tag === 'WorkspaceNotAllowedError') return 'That folder is not a repository.'
  return 'Coding agent could not complete the request.'
}
