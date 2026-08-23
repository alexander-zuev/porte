import type { HostRelayError, RelayHandshakeRefused } from '@host/application/host-error.ts'
import type {
  ConversationEmission,
  ConversationId,
  ConversationStateSnapshot,
  ConversationSummary,
  EventSequence,
  HostCommand,
  HostCommandResponse,
  HostConversationSyncMessage,
  OperationId,
} from '@porte/core/client'
import type { Result } from 'better-result'

/** Optional lifecycle output for one outbound relay connection. */
export interface PorteRelayObserver {
  connected(): void
  reconnecting(delayMs: number): void
}

type WithoutSyncEnvelope<Message> = Message extends unknown
  ? Omit<Message, 'v' | 'type' | 'operationId'>
  : never

/** Catalog chunk data before the WebSocket adapter adds its protocol envelope. */
export type ConversationSyncChunk = WithoutSyncEnvelope<HostConversationSyncMessage>

/** One authenticated connection from the Mac host to its relay Agent. */
export interface PorteConnection {
  /**
   * The last event sequence this host numbered for each conversation.
   *
   * A conversation missing here is one this host cannot number safely, so the
   * relay answers with the position its own records already hold.
   */
  eventHeads(): Record<ConversationId, EventSequence>

  /** Sends one command result or command error. */
  sendCommandResponse(response: HostCommandResponse): void

  /** Stores and sends one event until the relay acknowledges it. */
  sendConversationEvent(emission: ConversationEmission): void

  /** Stores and sends one state checkpoint until the relay acknowledges it. */
  sendConversationSnapshot(
    conversationId: ConversationId,
    snapshot: ConversationStateSnapshot,
  ): void

  /** Sends one chunk from a full conversation catalog sync. */
  sendConversationChunk(operationId: OperationId, chunk: ConversationSyncChunk): void

  /** Sends one changed conversation summary. */
  sendConversationSummary(conversation: ConversationSummary): void

  /** Removes one conversation from the relay catalog. */
  sendConversationRemoved(conversationId: ConversationId): void
}

/** Callbacks for validated relay messages. */
export type PorteRelayHandlers<THandlerError> = {
  readonly onConnected: (connection: PorteConnection) => Promise<Result<void, THandlerError>>
  readonly onCommand: (
    command: HostCommand,
    connection: PorteConnection,
  ) => Promise<Result<void, THandlerError>>
}

export type RunPorteRelay<THandlerError> = {
  readonly relayUrl: string
  readonly token: string
  readonly signal: AbortSignal
  readonly handlers: PorteRelayHandlers<THandlerError>
}

/** Outbound relay transport used by the host application. */
export interface PorteRelay {
  /** Keeps one authenticated PartySocket active until the caller stops it. */
  run<THandlerError>(
    input: RunPorteRelay<THandlerError>,
  ): Promise<Result<void, HostRelayError | RelayHandshakeRefused | THandlerError>>
}
