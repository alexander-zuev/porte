import { matchError, TaggedError } from 'better-result'

import type { CodingAgentResumeError } from './sessions/coding-agent-sessions.ts'
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

/** The host could not read its local session store. */
export class SessionStoreError extends TaggedError('SessionStoreError')<{
  operation: 'list'
  cause: unknown
  message: string
}> {
  constructor(args: { operation: 'list'; cause: unknown }) {
    super({ ...args, message: 'session store is unavailable' })
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
  | CodingAgentResumeError
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
    CodingAgentResumeError: () => 1,
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
      `Error (ENOTFOUND): ${failed.message}. Run \`porte list\` to see ids.`,
    DuplicateSessionError: (failed) =>
      `Error (EDUPLICATE): session ${failed.sessionId} exists in more than one folder:\n${failed.message}`,
    SessionStoreError: () =>
      'Error (ESTORE): cannot read Grok sessions. Check GROK_HOME and file permissions.',
    CodingAgentResumeError: (failed) => `Error (EAGENT): ${failed.message}`,
    HostRelayError: () => 'Error (ERELAY): host relay stopped. Restart `porte up`.',
  })
  if (error._tag === 'UsageError') {
    return body
  }
  return `porte v${VERSION} — ${body}`
}
