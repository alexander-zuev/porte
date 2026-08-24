import { attachConversation } from '@host/application/commands/attach-conversation.command.ts'
import type { HostApplicationResources } from '@host/application/host-application-resources.ts'
import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import type { ConversationMessageDispatcher } from '@host/entrypoints/websocket/conversation-dispatcher.ts'
import type { WebSocketRequestError } from '@host/entrypoints/websocket/websocket-error-boundary.ts'
import {
  ConversationConnectionUnavailableError,
  HostWebSocketError,
  RelayHandshakeRefused,
  RelayProtocolError,
} from '@host/entrypoints/websocket/websocket-errors.ts'
import {
  isTerminalWebSocketCloseCode,
  type WebSocketClient,
} from '@host/infrastructure/websocket/party-socket-client.ts'
import type { ConversationId } from '@porte/core/client'
import { Result, type Result as ResultType } from 'better-result'

/** One active Host conversation connection. */
export interface ConversationConnection {
  /** Resolve after the first successful application attachment. */
  readonly ready: Promise<ResultType<void, WebSocketRequestError>>

  /** Resolve on an intentional close and reject on a terminal failure. */
  readonly closed: Promise<void>

  /** Attach the WebSocket listeners. */
  open(): void

  /** Remove listeners and close the WebSocket. */
  close(): void
}

/** Dependencies for one WebSocket conversation connection. */
export type WebSocketConversationConnectionInput = {
  readonly context: HostApplicationResources
  readonly controlNotifications: ControlNotifications
  readonly conversationId: ConversationId
  readonly conversationNotifications: ConversationNotifications
  readonly dispatcher: ConversationMessageDispatcher
  readonly socket: WebSocketClient
}

/** Own the listeners for one conversation WebSocket. */
export class WebSocketConversationConnection implements ConversationConnection {
  private readonly readiness = Promise.withResolvers<ResultType<void, WebSocketRequestError>>()
  private readonly completion = Promise.withResolvers<void>()
  private active = false
  private readySettled = false
  private closedSettled = false
  private work = Promise.resolve()

  readonly ready = this.readiness.promise
  readonly closed = this.completion.promise

  constructor(private readonly input: WebSocketConversationConnectionInput) {}

  /** Attach the WebSocket listeners. */
  open(): void {
    if (this.active) return
    this.active = true
    this.input.socket.addEventListener('open', this.onOpen)
    this.input.socket.addEventListener('message', this.onMessage)
    this.input.socket.addEventListener('close', this.onClose)
  }

  /** Remove listeners and close the WebSocket. */
  close(): void {
    if (!this.active && this.closedSettled) return
    this.detach()
    this.input.socket.close(1000, 'conversation connection closed')
    this.resolveReady(Result.err(new ConversationConnectionUnavailableError()))
    this.resolveClosed()
  }

  private readonly onOpen = (): void => {
    void attachConversation(
      this.input.context.agent,
      this.input.context.catalog,
      this.input.controlNotifications,
      this.input.conversationNotifications,
      this.input.conversationId,
    )
      .then((result) => {
        this.resolveReady(result)
        if (result.isErr()) this.input.socket.close(1008, 'conversation unavailable')
      })
      .catch((cause: unknown) => {
        this.rejectClosed(new HostWebSocketError({ cause }))
      })
  }

  private readonly onMessage = (event: MessageEvent): void => {
    this.work = this.work
      .then(() => this.input.dispatcher.dispatch(event, this.input.socket))
      .catch((cause: unknown) => {
        this.rejectClosed(new HostWebSocketError({ cause }))
      })
  }

  private readonly onClose = (event: CloseEvent): void => {
    const failure = this.input.socket.connectionFailure
    if (failure !== undefined) {
      this.resolveReady(Result.err(new ConversationConnectionUnavailableError()))
      this.rejectClosed(new RelayHandshakeRefused({ status: failure.status }))
      return
    }
    if (isTerminalWebSocketCloseCode(event.code)) {
      this.resolveReady(Result.err(new ConversationConnectionUnavailableError()))
      this.rejectClosed(
        new RelayProtocolError({ message: `Conversation connection closed: ${event.reason}` }),
      )
    }
  }

  private detach(): void {
    this.active = false
    this.input.socket.removeEventListener('open', this.onOpen)
    this.input.socket.removeEventListener('message', this.onMessage)
    this.input.socket.removeEventListener('close', this.onClose)
  }

  private resolveReady(result: ResultType<void, WebSocketRequestError>): void {
    if (this.readySettled) return
    this.readySettled = true
    this.readiness.resolve(result)
  }

  private resolveClosed(): void {
    if (this.closedSettled) return
    this.closedSettled = true
    this.detach()
    this.completion.resolve()
  }

  private rejectClosed(cause: unknown): void {
    if (this.closedSettled) return
    this.closedSettled = true
    this.detach()
    this.input.socket.close(1011, 'conversation connection stopped')
    this.completion.reject(cause)
  }
}
