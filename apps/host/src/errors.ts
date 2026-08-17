import { matchError, TaggedError } from 'better-result'

import type { JsonRpcError } from './grok/acp-message.ts'
import { VERSION } from './version.ts'

/** Bad argv or missing required flags. */
export class UsageError extends TaggedError('UsageError')<{
  message: string
}> {}

/** No session folder matched this id. */
export class SessionNotFoundError extends TaggedError('SessionNotFoundError')<{
  sessionId: string
  message: string
}> {
  constructor(args: { sessionId: string }) {
    super({ ...args, message: `session not found: ${args.sessionId}` })
  }
}

/** The same session id exists in more than one folder. */
export class DuplicateSessionError extends TaggedError('DuplicateSessionError')<{
  sessionId: string
  folderPaths: readonly string[]
  message: string
}> {
  constructor(args: { sessionId: string; folderPaths: readonly string[] }) {
    super({ ...args, message: args.folderPaths.join('\n') })
  }
}

/** The host could not read the Grok session store. */
export class SessionStoreError extends TaggedError('SessionStoreError')<{
  operation: 'list'
  cause: unknown
  message: string
}> {
  constructor(args: { operation: 'list'; cause: unknown }) {
    super({ ...args, message: 'session store is unavailable' })
  }
}

/** `grok` is not on PATH. */
export class GrokNotFoundError extends TaggedError('GrokNotFoundError')<{
  message: string
}> {
  constructor() {
    super({ message: 'grok not found on PATH' })
  }
}

/** Grok returned a JSON-RPC error. */
export class AcpRpcError extends TaggedError('AcpRpcError')<{
  rpc: JsonRpcError
  message: string
}> {
  constructor(args: { rpc: JsonRpcError }) {
    super({ ...args, message: args.rpc.message })
  }
}

/** The Grok child exited before the request finished. */
export class GrokExitedError extends TaggedError('GrokExitedError')<{
  code: number | null
  message: string
}> {
  constructor(args: { code: number | null }) {
    super({
      ...args,
      message: `grok exited ${args.code === null ? 'null' : String(args.code)}`,
    })
  }
}

/** The outbound host relay stopped because local handling failed. */
export class HostRelayError extends TaggedError('HostRelayError')<{
  cause: unknown
  message: string
}> {
  constructor(args: { cause: unknown }) {
    super({ ...args, message: 'host relay stopped' })
  }
}

/** Every error the CLI can print. */
export type CliError =
  | UsageError
  | SessionNotFoundError
  | DuplicateSessionError
  | SessionStoreError
  | GrokNotFoundError
  | AcpRpcError
  | GrokExitedError
  | HostRelayError

/**
 * Map a CLI error to an exit code.
 *
 * @param error - A tagged CLI error.
 */
export function exitCodeFor(error: CliError): number {
  return matchError(error, {
    UsageError: () => 2,
    SessionNotFoundError: () => 2,
    DuplicateSessionError: () => 2,
    SessionStoreError: () => 1,
    GrokNotFoundError: () => 1,
    AcpRpcError: () => 1,
    GrokExitedError: () => 1,
    HostRelayError: () => 1,
  })
}

/**
 * Human line for stderr. Data stays on stdout.
 *
 * @param error - A tagged CLI error.
 */
export function formatError(error: CliError): string {
  const body = matchError(error, {
    UsageError: (failed) => failed.message,
    SessionNotFoundError: (failed) =>
      `Error (ENOTFOUND): ${failed.message}. Run \`lras list\` to see ids.`,
    DuplicateSessionError: (failed) =>
      `Error (EDUPLICATE): session ${failed.sessionId} exists in more than one folder:\n${failed.message}`,
    SessionStoreError: () =>
      'Error (ESTORE): cannot read Grok sessions. Check GROK_HOME and file permissions.',
    GrokNotFoundError: () =>
      'Error (EGROK): grok not found on PATH. Install Grok Build and ensure `grok` is on PATH.',
    AcpRpcError: (failed) => `Error (EACP): ${JSON.stringify(failed.rpc)}`,
    GrokExitedError: (failed) =>
      `Error (EEXIT): ${failed.message}. The session files stay on disk. Retry the same id.`,
    HostRelayError: () => 'Error (ERELAY): host relay stopped. Restart `lras up`.',
  })
  if (error._tag === 'UsageError') {
    return body
  }
  return `lras v${VERSION} — ${body}`
}
