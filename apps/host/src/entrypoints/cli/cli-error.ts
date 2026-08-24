import { HostNotPairedError } from '@host/application/host-not-paired-error.ts'
import { PairingError } from '@host/application/pairing-error.ts'
import { CredentialStoreError } from '@host/application/ports/credential-store.ts'
import { ConfigError } from '@host/entrypoints/cli/host-config.ts'
import {
  HostWebSocketError,
  RelayHandshakeRefused,
} from '@host/entrypoints/websocket/websocket-errors.ts'
import type { FailureClassification } from '@porte/core/client'
import { matchError, TaggedError } from 'better-result'

import { VERSION } from './version.ts'

/** Bad arguments or missing required flags. */
export class UsageError extends TaggedError('UsageError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(args: { message: string }) {
    super({ ...args, classification: 'terminal' })
  }
}

/** Every error the CLI can print. */
export type CliError =
  | UsageError
  | ConfigError
  | HostNotPairedError
  | HostWebSocketError
  | RelayHandshakeRefused
  | PairingError
  | CredentialStoreError

/** Test whether a caught value is an expected CLI error. */
export function isCliError(cause: unknown): cause is CliError {
  return (
    cause instanceof UsageError ||
    cause instanceof ConfigError ||
    cause instanceof HostNotPairedError ||
    cause instanceof HostWebSocketError ||
    cause instanceof RelayHandshakeRefused ||
    cause instanceof PairingError ||
    cause instanceof CredentialStoreError
  )
}

/** Map one CLI error to its process exit code. */
export function exitCodeFor(error: CliError): number {
  return matchError(error, {
    UsageError: () => 2,
    // Also 2: the invocation is wrong, even though argv is not what is wrong.
    ConfigError: () => 2,
    HostNotPairedError: () => 2,
    HostWebSocketError: () => 1,
    RelayHandshakeRefused: (failed) => (failed.status === 401 || failed.status === 403 ? 2 : 1),
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
    HostNotPairedError: (failed) => failed.message,
    HostWebSocketError: () => 'Error (ERELAY): host connection stopped. Restart `porte up`.',
    RelayHandshakeRefused: (failed) =>
      failed.status === 401 || failed.status === 403
        ? `Error (EAUTH): ${failed.message} Run \`porte pair\` to pair this Mac again.`
        : `Error (ERELAY): ${failed.message}`,
    PairingError: (failed) => `Error (EPAIR): ${failed.message} Run \`porte pair\` to try again.`,
    CredentialStoreError: (failed) => `Error (ECRED): ${failed.message}`,
  })
  return error._tag === 'UsageError' ? body : `porte v${VERSION} — ${body}`
}
