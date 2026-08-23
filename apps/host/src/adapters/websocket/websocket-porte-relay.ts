import { FileHostLedger } from '@host/adapters/node/host-ledger.ts'
import { HostRelayError, RelayHandshakeRefused } from '@host/application/host-error.ts'
import type {
  ConversationSyncChunk,
  PorteConnection,
  PorteRelay,
  PorteRelayObserver,
  RunPorteRelay,
} from '@host/application/ports/porte-relay.ts'
import {
  RelayHeartbeat,
  RelayToHostMessageSchema,
  RELAY_HEARTBEAT_REQUEST,
  RELAY_HEARTBEAT_RESPONSE,
  type ConversationEmission,
  type ConversationId,
  type ConversationStateSnapshot,
  type ConversationSummary,
  type EventSequence,
  type HostCommand,
  type HostCommandResponse,
  type HostToRelayMessage,
  type OperationId,
} from '@porte/core/client'
import { Result, type Result as ResultType } from 'better-result'
import PartySocket from 'partysocket'
import { WebSocket } from 'ws'
import { z } from 'zod'

const MAX_RETRY_DELAY_MS = 5_000

type RelaySocket = Pick<
  PartySocket,
  'addEventListener' | 'close' | 'reconnect' | 'retryCount' | 'send'
>
type RelaySocketFactory = (options: ConstructorParameters<typeof PartySocket>[0]) => RelaySocket

class HostConnectionSendError extends Error {
  constructor(cause?: unknown) {
    super('Host connection send failed', { cause })
    this.name = 'HostConnectionSendError'
  }
}

class HostConnectionClosedError extends Error {
  constructor(
    readonly code: number,
    readonly reason: string,
  ) {
    super(`Host connection closed with code ${String(code)}`)
    this.name = 'HostConnectionClosedError'
  }
}

class RelayProtocolError extends Error {
  constructor() {
    super('Relay message failed its protocol contract')
    this.name = 'RelayProtocolError'
  }
}

/** Sends v2 relay messages and persists command and event delivery. */
class PartySocketPorteConnection implements PorteConnection {
  private outgoing: Promise<void> = Promise.resolve()

  constructor(
    private readonly socket: RelaySocket,
    private readonly ledger: FileHostLedger,
    private readonly onFailure: (cause: unknown) => void,
  ) {}

  eventHeads() {
    return this.ledger.eventHeads()
  }

  sendCommandResponse(response: HostCommandResponse): void {
    this.enqueue(async () => {
      await this.ledger.completeOperation(response)
      this.send(response)
    })
  }

  sendConversationEvent(emission: ConversationEmission): void {
    this.enqueue(async () => {
      const message = await this.ledger.recordEvent(emission)
      this.send(message)
    })
  }

  sendConversationSnapshot(
    conversationId: ConversationId,
    snapshot: ConversationStateSnapshot,
  ): void {
    this.enqueue(async () => {
      const message = await this.ledger.recordSnapshot(conversationId, snapshot)
      this.send(message)
    })
  }

  sendConversationChunk(operationId: OperationId, chunk: ConversationSyncChunk): void {
    if (chunk.done) {
      this.send({
        v: 2,
        type: 'conversations.sync',
        operationId,
        conversations: [...chunk.conversations],
        done: true,
        activeTurns: [...chunk.activeTurns],
      })
      return
    }
    this.send({
      v: 2,
      type: 'conversations.sync',
      operationId,
      conversations: [...chunk.conversations],
      done: false,
    })
  }

  sendConversationSummary(conversation: ConversationSummary): void {
    this.enqueue(() => {
      this.send({ v: 2, type: 'conversation.summary', conversation })
    })
  }

  sendConversationRemoved(conversationId: ConversationId): void {
    this.enqueue(() => {
      this.send({ v: 2, type: 'conversation.removed', conversationId })
    })
  }

  /** Replays events that did not receive an acknowledgment. */
  replayEvents(): void {
    this.enqueue(() => {
      for (const message of this.ledger.pendingEvents()) this.send(message)
    })
  }

  /** Waits until all ledger writes started by one command finish. */
  async flush(): Promise<void> {
    await this.outgoing
  }

  private send(message: HostToRelayMessage): void {
    const frame = JSON.stringify(message)
    try {
      if (!this.socket.send(frame)) throw new HostConnectionSendError()
    } catch (cause) {
      if (cause instanceof HostConnectionSendError) throw cause
      throw new HostConnectionSendError(cause)
    }
  }

  private enqueue(work: () => void | Promise<void>): void {
    const next = this.outgoing.then(work)
    this.outgoing = next.catch((cause) => {
      this.onFailure(cause)
    })
  }
}

/** Connects the host through PartySocket with bounded reconnect delay. */
export class WebSocketPorteRelay implements PorteRelay {
  constructor(
    private readonly observer: PorteRelayObserver,
    private readonly ledger: FileHostLedger,
    private readonly createSocket: RelaySocketFactory = (options) => new PartySocket(options),
  ) {}

  async run<THandlerError>(
    input: RunPorteRelay<THandlerError>,
  ): Promise<ResultType<void, HostRelayError | RelayHandshakeRefused | THandlerError>> {
    if (input.signal.aborted) return Result.ok()
    const relayUrl = new URL(input.relayUrl)
    try {
      await this.ledger.open(`${relayUrl.origin}${relayUrl.pathname}\n${input.token}`)
    } catch (cause) {
      return Result.err(new HostRelayError({ cause }))
    }

    return await new Promise((resolve) => {
      let settled = false
      let heartbeat: RelayHeartbeat | undefined
      const inFlight = new Map<OperationId, Promise<ResultType<void, THandlerError>>>()
      const finish = (
        result: ResultType<void, HostRelayError | RelayHandshakeRefused | THandlerError>,
      ): void => {
        if (settled) return
        settled = true
        heartbeat?.stop()
        input.signal.removeEventListener('abort', onAbort)
        socket.close(1000, 'host stopped')
        resolve(result)
      }
      const fail = (cause: unknown): void => {
        finish(Result.err(new HostRelayError({ cause })))
      }
      const recover = (cause: unknown): void => {
        if (settled) return
        if (cause instanceof HostConnectionSendError) {
          socket.reconnect(1011, 'host send failed')
          return
        }
        fail(cause)
      }
      const onAbort = (): void => {
        finish(Result.ok())
      }
      const AuthenticatedWebSocket = authenticatedWebSocket(input.token, (status) => {
        finish(Result.err(new RelayHandshakeRefused({ status })))
      })
      const socket = this.createSocket({
        host: relayUrl.host,
        protocol: relayUrl.protocol === 'ws:' ? 'ws' : 'wss',
        basePath: relayUrl.pathname.replace(/^\//, ''),
        WebSocket: AuthenticatedWebSocket,
        minReconnectionDelay: 250,
        maxReconnectionDelay: MAX_RETRY_DELAY_MS,
        reconnectionDelayGrowFactor: 2,
        maxEnqueuedMessages: 0,
        shouldReconnectOnClose: (event) => event.code !== 1000 && event.code !== 1008,
      })
      const connection = new PartySocketPorteConnection(socket, this.ledger, recover)

      input.signal.addEventListener('abort', onAbort, { once: true })
      socket.addEventListener('open', () => {
        if (settled) {
          socket.close(1000, 'host stopped')
          return
        }
        heartbeat?.stop()
        heartbeat = new RelayHeartbeat(
          () => socket.send(RELAY_HEARTBEAT_REQUEST),
          () => {
            socket.reconnect(1011, 'relay heartbeat expired')
          },
        )
        heartbeat.start()
        this.observer.connected()
        connection.replayEvents()
        void input.handlers.onConnected(connection).then((handled) => {
          if (handled.isErr()) {
            finish(Result.err(handled.error))
            return undefined
          }
          return undefined
        }, fail)
      })
      socket.addEventListener('message', (event) => {
        if (event.data === RELAY_HEARTBEAT_RESPONSE) {
          heartbeat?.acknowledge()
          return
        }
        const frame = z.string().safeParse(event.data)
        const message = frame.success ? parseRelayMessage(frame.data) : undefined
        if (message === undefined) {
          fail(new RelayProtocolError())
          return
        }
        if (message.type === 'event.ack') {
          void this.ledger
            .acknowledgeEvents(message.conversationId, message.throughEventSequence)
            .catch(fail)
          return
        }

        const current = inFlight.get(message.operationId)
        if (current !== undefined) return
        const handling = this.handleCommand(message, connection, input)
        inFlight.set(message.operationId, handling)
        void handling.then(
          (handled) => {
            inFlight.delete(message.operationId)
            if (handled.isErr()) finish(Result.err(handled.error))
            return undefined
          },
          (cause) => {
            inFlight.delete(message.operationId)
            recover(cause)
            return undefined
          },
        )
      })
      socket.addEventListener('close', (event) => {
        heartbeat?.stop()
        if (settled) return
        if (event.code === 1000) {
          finish(Result.ok())
          return
        }
        if (event.code === 1008) {
          fail(new HostConnectionClosedError(event.code, event.reason))
          return
        }
        this.observer.reconnecting(retryDelayMs(socket.retryCount))
      })
    })
  }

  private async handleCommand<THandlerError>(
    command: HostCommand,
    connection: PartySocketPorteConnection,
    input: RunPorteRelay<THandlerError>,
  ): Promise<ResultType<void, THandlerError>> {
    if (this.ledger.conflicts(command)) {
      connection.sendCommandResponse(operationConflict(command.operationId))
      await connection.flush()
      return Result.ok()
    }
    const terminal = this.ledger.terminalResponse(command)
    if (terminal !== undefined) {
      connection.sendCommandResponse(terminal)
      await connection.flush()
      return Result.ok()
    }

    await this.ledger.startOperation(command)
    const handled = await input.handlers.onCommand(command, connection)
    if (handled.isErr()) return handled
    await connection.flush()
    return Result.ok()
  }
}

function parseRelayMessage(frame: string) {
  try {
    const parsed = RelayToHostMessageSchema.safeParse(JSON.parse(frame))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function authenticatedWebSocket(token: string, onRefused: (status: number) => void) {
  return class AuthenticatedWebSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
      super(address, protocols ?? [], { headers: { Authorization: `Bearer ${token}` } })
      this.on('unexpected-response', (_request, response) => {
        onRefused(response.statusCode ?? 0)
      })
    }
  }
}

function operationConflict(operationId: OperationId): HostCommandResponse {
  return {
    v: 2,
    type: 'command.error',
    operationId,
    error: { _tag: 'OperationConflictError', message: 'Operation identifier is already in use.' },
  }
}

export function retryDelayMs(attempt: number): number {
  return attempt <= 0 ? 0 : Math.min(250 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS)
}
