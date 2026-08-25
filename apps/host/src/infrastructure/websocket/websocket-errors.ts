import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

/** The HTTP upgrade for this WebSocket was refused. */
export class WebSocketHandshakeRefused extends TaggedError('WebSocketHandshakeRefused')<{
  status: number
  message: string
  classification: FailureClassification
}> {
  constructor(args: { status: number }) {
    super({
      ...args,
      message: `WebSocket handshake refused (HTTP ${String(args.status)})`,
      classification: 'terminal',
    })
  }
}

/** The peer closed with an RFC 6455 terminal close code (1002, 1003, 1007, 1008, 1009). */
export class WebSocketProtocolClose extends TaggedError('WebSocketProtocolClose')<{
  message: string
  classification: FailureClassification
}> {
  constructor(args: { message: string }) {
    super({ ...args, classification: 'terminal' })
  }
}

/** Inbound frame handling failed, so this connection stopped. */
export class WebSocketHandlerError extends TaggedError('WebSocketHandlerError')<{
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'WebSocket frame handler failed', classification: 'unknown' })
  }
}
