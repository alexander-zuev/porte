import type {
  ConfigError,
  CredentialStoreError,
  HostRelayError,
} from '@host/application/host-error.ts'
import type { PairingError } from '@host/application/pairing-error.ts'
import type { CodingAgentError } from '@host/application/ports/coding-agent.ts'
import { matchError, TaggedError } from 'better-result'

import { VERSION } from './version.ts'

/** Bad arguments or missing required flags. */
export class UsageError extends TaggedError('UsageError')<{ message: string }> {}

/** Every error the CLI can print. */
export type CliError =
  | UsageError
  | ConfigError
  | CodingAgentError
  | HostRelayError
  | PairingError
  | CredentialStoreError

/** Map one CLI error to its process exit code. */
export function exitCodeFor(error: CliError): number {
  return matchError(error, {
    UsageError: () => 2,
    // Also 2: the invocation is wrong, even though argv is not what is wrong.
    ConfigError: () => 2,
    CodingAgentError: (failed) =>
      failed.code === 'CONVERSATION_NOT_FOUND' || failed.code === 'PERMISSION_NOT_FOUND' ? 2 : 1,
    HostRelayError: () => 1,
    // Declining or letting the code expire is a choice, not a fault: exit clean
    // enough to retry, but non-zero so a script knows nothing was paired.
    PairingError: () => 1,
    CredentialStoreError: () => 1,
  })
}

/** Format one safe error for standard error output. */
export function formatError(error: CliError): string {
  const body = matchError(error, {
    UsageError: (failed) => failed.message,
    ConfigError: (failed) => `Error (ECONFIG): Porte configuration is invalid.\n${failed.message}`,
    CodingAgentError: (failed) =>
      failed.code === 'CONVERSATION_NOT_FOUND'
        ? 'Error (ENOTFOUND): conversation not found. Run `porte list` to see ids.'
        : `Error (EAGENT): ${failed.message}`,
    HostRelayError: () => 'Error (ERELAY): host relay stopped. Restart `porte up`.',
    PairingError: (failed) => `Error (EPAIR): ${failed.message} Run \`porte pair\` to try again.`,
    CredentialStoreError: (failed) => `Error (ECRED): ${failed.message}`,
  })
  return error._tag === 'UsageError' ? body : `porte v${VERSION} — ${body}`
}
