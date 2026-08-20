import { Result, type Result as ResultType } from 'better-result'

import type { CredentialStoreError } from './host-error.ts'
import { PairingError } from './pairing-error.ts'
import type { CredentialStore } from './ports/credential-store.ts'
import type { DeviceAuthorizer, DeviceCodeGrant } from './ports/device-authorizer.ts'

/** What the caller shows the person while the daemon waits. */
export type PairingPrompt = {
  readonly userCode: string
  readonly verificationUri: string
  readonly expiresInSeconds: number
}

export type PairHostInput = {
  readonly authorizer: DeviceAuthorizer
  readonly credentials: CredentialStore
  readonly baseUrl: string
  /** Called once, as soon as there is a code worth showing. */
  readonly onPrompt: (prompt: PairingPrompt) => void
  /** Injected so tests do not wait in real time. */
  readonly sleep: (ms: number) => Promise<void>
  /** Injected so an expiry deadline can be tested without a clock. */
  readonly now: () => number
}

/**
 * Pair this Mac with a Porte account.
 *
 * The daemon asks for a code, shows it, and waits. Approval happens on the
 * person's phone, so this machine never handles a password and the credential
 * it ends up with belongs to whoever approved.
 */
export async function pairHost(
  input: PairHostInput,
): Promise<ResultType<void, PairingError | CredentialStoreError>> {
  const requested = await input.authorizer.requestCode()
  if (requested.isErr()) return Result.err(requested.error)

  const grant = requested.value
  input.onPrompt({
    userCode: grant.userCode,
    verificationUri: grant.verificationUri,
    expiresInSeconds: grant.expiresInSeconds,
  })

  const token = await waitForApproval(input, grant)
  if (token.isErr()) return Result.err(token.error)

  return input.credentials.write({ baseUrl: input.baseUrl, token: token.value })
}

/**
 * Poll until the person answers or the code dies.
 *
 * The deadline is enforced here as well as by the server, so a server that
 * stops answering cannot leave the daemon polling forever.
 */
async function waitForApproval(
  input: PairHostInput,
  grant: DeviceCodeGrant,
): Promise<ResultType<string, PairingError>> {
  const deadline = input.now() + grant.expiresInSeconds * 1000
  let intervalSeconds = grant.intervalSeconds

  while (input.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Each poll must follow the last by the server's interval.
    await input.sleep(intervalSeconds * 1000)

    // oxlint-disable-next-line no-await-in-loop -- One poll at a time is the grant's contract.
    const polled = await input.authorizer.poll(grant.deviceCode)
    if (polled.isErr()) return Result.err(polled.error)

    if (polled.value.status === 'granted') return Result.ok(polled.value.token)
    if (polled.value.status === 'slow-down') intervalSeconds += polled.value.intervalSeconds
  }

  return Result.err(new PairingError({ reason: 'expired' }))
}
