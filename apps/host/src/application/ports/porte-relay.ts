import type { HostRelayError, RelayHandshakeRefused } from '@host/application/host-error.ts'
import type {
  RoutedRequest,
  RoutedResponse,
  ConversationCatalog as ProtocolConversationCatalog,
} from '@porte/core'
import type { ConversationEvent } from '@porte/core/conversation-event'
import type { Result } from 'better-result'

type SyncedConversations = Extract<ProtocolConversationCatalog, { state: 'synced' }>

/** One authenticated Porte connection from the host to the Worker. */
export interface PorteConnection {
  /** Send the complete current conversation catalog. */
  sendConversations(conversations: SyncedConversations): void

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
