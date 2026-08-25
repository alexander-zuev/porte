import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

import type { JsonRpcError, JsonValue } from './message.ts'

/** A request from the ACP agent cannot be completed by the Host. */
export class AcpClientRequestError extends TaggedError('AcpClientRequestError')<{
  code: number
  data: JsonValue | undefined
  message: string
  classification: FailureClassification
}> {
  constructor(args: { code: number; message: string; data?: JsonValue }) {
    super({ ...args, data: args.data, classification: 'terminal' })
  }
}

/** The ACP agent process could not start. */
export class AcpStartError extends TaggedError('AcpStartError')<{
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause: unknown }) {
    super({
      ...args,
      message: 'ACP agent process could not start',
      classification: 'terminal',
    })
  }
}

/** An ACP request returned a JSON-RPC error. */
export class AcpRpcError extends TaggedError('AcpRpcError')<{
  rpc: JsonRpcError
  message: string
  classification: FailureClassification
}> {
  constructor(args: { rpc: JsonRpcError }) {
    super({ ...args, message: args.rpc.message, classification: 'terminal' })
  }
}

/** The ACP agent process exited before a request finished. */
export class AcpExitedError extends TaggedError('AcpExitedError')<{
  code: number | null
  message: string
  classification: FailureClassification
}> {
  constructor(args: { code: number | null }) {
    super({
      ...args,
      message: `ACP agent process exited ${String(args.code)}`,
      classification: 'transient',
    })
  }
}

/** The active ACP process reported a transport failure. */
export class AcpTransportError extends TaggedError('AcpTransportError')<{
  cause: unknown
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'ACP process transport failed', classification: 'transient' })
  }
}

/** An ACP request did not finish before its deadline. */
export class AcpTimeoutError extends TaggedError('AcpTimeoutError')<{
  timeoutMs: number
  message: string
  classification: FailureClassification
}> {
  constructor(args: { timeoutMs: number }) {
    super({ ...args, message: 'ACP request timed out', classification: 'transient' })
  }
}

/** The ACP agent selected a protocol version that this client does not implement. */
export class AcpProtocolVersionMismatchError extends TaggedError(
  'AcpProtocolVersionMismatchError',
)<{
  expected: number
  received: number
  message: string
  classification: FailureClassification
}> {
  constructor(args: { expected: number; received: number }) {
    super({
      ...args,
      message: `ACP protocol version ${String(args.received)} is not supported`,
      classification: 'terminal',
    })
  }
}
