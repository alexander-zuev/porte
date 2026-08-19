import { TaggedError } from 'better-result'

import type { JsonRpcError } from './message.ts'

/** The ACP agent process could not start. */
export class AcpStartError extends TaggedError('AcpStartError')<{
  cause: unknown
  message: string
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'ACP agent process could not start' })
  }
}

/** An ACP request returned a JSON-RPC error. */
export class AcpRpcError extends TaggedError('AcpRpcError')<{
  rpc: JsonRpcError
  message: string
}> {
  constructor(args: { rpc: JsonRpcError }) {
    super({ ...args, message: args.rpc.message })
  }
}

/** The ACP agent process exited before a request finished. */
export class AcpExitedError extends TaggedError('AcpExitedError')<{
  code: number | null
  message: string
}> {
  constructor(args: { code: number | null }) {
    super({ ...args, message: `ACP agent process exited ${String(args.code)}` })
  }
}

/** The active ACP process reported a transport failure. */
export class AcpTransportError extends TaggedError('AcpTransportError')<{
  cause: unknown
  message: string
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'ACP process transport failed' })
  }
}

/** An ACP request did not finish before its deadline. */
export class AcpTimeoutError extends TaggedError('AcpTimeoutError')<{
  timeoutMs: number
  message: string
}> {
  constructor(args: { timeoutMs: number }) {
    super({ ...args, message: 'ACP request timed out' })
  }
}
