import { matchError, TaggedError } from 'better-result'

import type { HostRelayError } from '../application/host-error.ts'
import type { CodingAgentError } from '../application/ports/coding-agent.ts'
import { VERSION } from './version.ts'

/** Bad arguments or missing required flags. */
export class UsageError extends TaggedError('UsageError')<{ message: string }> {}

/** Every error the CLI can print. */
export type CliError = UsageError | CodingAgentError | HostRelayError

/** Map one CLI error to its process exit code. */
export function exitCodeFor(error: CliError): number {
  return matchError(error, {
    UsageError: () => 2,
    CodingAgentError: (failed) =>
      failed.code === 'CONVERSATION_NOT_FOUND' || failed.code === 'PERMISSION_NOT_FOUND' ? 2 : 1,
    HostRelayError: () => 1,
  })
}

/** Format one safe error for standard error output. */
export function formatError(error: CliError): string {
  const body = matchError(error, {
    UsageError: (failed) => failed.message,
    CodingAgentError: (failed) =>
      failed.code === 'CONVERSATION_NOT_FOUND'
        ? 'Error (ENOTFOUND): conversation not found. Run `porte list` to see ids.'
        : `Error (EAGENT): ${failed.message}`,
    HostRelayError: () => 'Error (ERELAY): host relay stopped. Restart `porte up`.',
  })
  return error._tag === 'UsageError' ? body : `porte v${VERSION} — ${body}`
}
