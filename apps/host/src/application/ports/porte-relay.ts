import type { HostRelayError, RelayHandshakeRefused } from '@host/application/host-error.ts'
import type {
  ConversationId,
  ConversationSummary,
  RoutedRequest,
  RoutedResponse,
} from '@porte/core/client'
import type { ConversationEvent } from '@porte/core/client'
import type { Result } from 'better-result'

/** One authenticated Porte connection from the host to the Worker. */
export interface PorteConnection {
  /**
   * Send one chunk of a full sync of the conversation list.
   *
   * Chunked because a Mac's history has no bound and one frame should not carry
   * all of it. Every chunk of one sync shares an `epoch`; on the chunk marked
   * `done` the relay drops whatever kept an older one, which is how a
   * conversation deleted here stops existing there.
   */
  sendConversationChunk(chunk: {
    epoch: string
    conversations: readonly ConversationSummary[]
    done: boolean
  }): void

  /** Send one conversation whose summary changed since the last sync. */
  sendConversationSummary(conversation: ConversationSummary): void

  /** Say that one conversation is gone, so the relay stops listing it. */
  sendConversationRemoved(conversationId: ConversationId): void

  /** Send one canonical conversation event. */
  sendConversationEvent(event: ConversationEvent): void

  /** Send one response to a routed client request. */
  sendResponse(response: RoutedResponse): void
}

/** Callbacks for validated messages from one Porte connection. */
export type PorteRelayHandlers<THandlerError> = {
  readonly onConnected: (connection: PorteConnection) => Promise<Result<void, THandlerError>>
  readonly onRequest: (
    request: RoutedRequest,
    connection: PorteConnection,
  ) => Promise<Result<void, THandlerError>>
}

export type RunPorteRelay<THandlerError> = {
  readonly relayUrl: string
  readonly token: string
  readonly signal: AbortSignal
  readonly handlers: PorteRelayHandlers<THandlerError>
}

/** Outbound Porte connection used by the host application. */
export interface PorteRelay {
  /** Keep one authenticated connection active until it stops. */
  run<THandlerError>(
    input: RunPorteRelay<THandlerError>,
  ): Promise<Result<void, HostRelayError | RelayHandshakeRefused | THandlerError>>
}
