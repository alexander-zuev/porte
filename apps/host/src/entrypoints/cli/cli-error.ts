import { HostNotPairedError, PairingError } from '@host/application/errors/pairing-errors.ts'
import { CredentialStoreError } from '@host/application/ports/credential-store.ts'
import { ConfigError } from '@host/infrastructure/config/host-config.ts'
import { UnsupportedPlatformError } from '@host/infrastructure/node/machine.ts'
import {
  WebSocketHandlerError,
  WebSocketHandshakeRefused,
  WebSocketProtocolClose,
} from '@host/infrastructure/websocket/websocket-errors.ts'
import { JsonRpcSendError, type FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'

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
  | UnsupportedPlatformError
  | HostNotPairedError
  | WebSocketHandlerError
  | JsonRpcSendError
  | WebSocketHandshakeRefused
  | WebSocketProtocolClose
  | PairingError
  | CredentialStoreError

/** Test whether a caught value is an expected CLI error. */
export function isCliError(cause: unknown): cause is CliError {
  return (
    cause instanceof UsageError ||
    cause instanceof ConfigError ||
    cause instanceof UnsupportedPlatformError ||
    cause instanceof HostNotPairedError ||
    cause instanceof WebSocketHandlerError ||
    cause instanceof JsonRpcSendError ||
    cause instanceof WebSocketHandshakeRefused ||
    cause instanceof WebSocketProtocolClose ||
    cause instanceof PairingError ||
    cause instanceof CredentialStoreError
  )
}

/** Map one CLI error to its process exit code. */
export function exitCodeFor(error: CliError): number {
  if (error instanceof UsageError) return 2
  if (error instanceof ConfigError) return 2
  if (error instanceof HostNotPairedError) return 2
  if (error instanceof WebSocketHandshakeRefused) {
    return error.status === 401 || error.status === 403 ? 2 : 1
  }
  return 1
}

/** Format one safe error for standard error output. */
export function formatError(error: CliError): string {
  if (error instanceof UsageError) return error.message

  let body: string
  if (error instanceof ConfigError || error instanceof UnsupportedPlatformError) {
    body = `Error (ECONFIG): Porte configuration is invalid.\n${error.message}`
  } else if (error instanceof HostNotPairedError) {
    body = error.message
  } else if (error instanceof WebSocketHandlerError || error instanceof JsonRpcSendError) {
    body = 'Error (ERELAY): host connection stopped. Restart `porte up`.'
  } else if (error instanceof WebSocketHandshakeRefused) {
    body =
      error.status === 401 || error.status === 403
        ? `Error (EAUTH): ${error.message} Run \`porte pair\` to pair this machine again.`
        : `Error (ERELAY): ${error.message}`
  } else if (error instanceof WebSocketProtocolClose) {
    body = `Error (ERELAY): ${error.message}`
  } else if (error instanceof PairingError) {
    body = `Error (EPAIR): ${error.message} Run \`porte pair\` to try again.`
  } else {
    body = `Error (ECRED): ${error.message}`
  }
  return `porte v${VERSION} — ${body}`
}
