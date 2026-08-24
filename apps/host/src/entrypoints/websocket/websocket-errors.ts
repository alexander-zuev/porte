import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

/** The relay refused the WebSocket handshake. */
export class RelayHandshakeRefused extends TaggedError('RelayHandshakeRefused')<{
  status: number
  message: string
  classification: FailureClassification
}> {
  constructor(args: { status: number }) {
    super({
      ...args,
      message: `Porte refused the connection (HTTP ${String(args.status)})`,
      classification: 'terminal',
    })
  }
}

/** The Host WebSocket entrypoint stopped after a local failure. */
export class HostWebSocketError extends TaggedError('HostWebSocketError')<{
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'host connection stopped', classification: 'unknown' })
  }
}

/** A connection operation violated the Host connection lifecycle. */
export class HostConnectionStateError extends TaggedError('HostConnectionStateError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(args: { message: string }) {
    super({ ...args, classification: 'terminal' })
  }
}

/** One conversation connection could not open. */
export class ConversationConnectionUnavailableError extends TaggedError(
  'ConversationConnectionUnavailableError',
)<{
  message: string
  classification: FailureClassification
}> {
  constructor() {
    super({ message: 'Conversation connection did not open.', classification: 'terminal' })
  }
}

/** The relay closed a connection after a protocol failure. */
export class RelayProtocolError extends TaggedError('RelayProtocolError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(args: { message: string }) {
    super({ ...args, classification: 'terminal' })
  }
}
