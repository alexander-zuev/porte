import type { CredentialStore } from '@host/application/ports/credential-store.ts'
import type {
  DeviceAuthorizer,
  DeviceCodeGrant,
} from '@host/application/ports/device-authorizer.ts'
import type { HostDescriptor } from '@porte/core/client'

/**
 * How pairing ended.
 *
 * All three are ordinary endings, so none of them is an error.
 */
export type PairingOutcome =
  /** `account` names whoever approved. Null when the server would not say. */
  | { readonly status: 'paired'; readonly account: string | null }
  | { readonly status: 'denied' }
  | { readonly status: 'expired' }

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
  /** What this machine is called. Only the machine asking for a code knows it. */
  readonly host: HostDescriptor
  /** Called once, as soon as there is a code worth showing. */
  readonly onPrompt: (prompt: PairingPrompt) => void
  /** Injected so tests do not wait in real time. */
  readonly sleep: (ms: number) => Promise<void>
  /** Injected so an expiry deadline can be tested without a clock. */
  readonly now: () => number
}

/**
 * Pair this machine with a Porte account.
 *
 * The daemon asks for a code, shows it, and waits. Approval happens on the
 * person's phone, so this machine never handles a password and the credential
 * it ends up with belongs to whoever approved.
 */
export async function pairHost(input: PairHostInput): Promise<PairingOutcome> {
  const grant = await input.authorizer.requestCode(input.host)
  input.onPrompt({
    userCode: grant.userCode,
    verificationUri: grant.verificationUri,
    expiresInSeconds: grant.expiresInSeconds,
  })

  const answered = await waitForApproval(input, grant)
  if (answered.status !== 'paired') return answered

  await input.credentials.write({
    baseUrl: input.baseUrl,
    token: answered.token,
  })

  // Asked after the credential is safe, so a server that will not name the
  // account cannot undo a pairing that already worked.
  const account = await input.authorizer.accountOf(answered.token)
  return { status: 'paired', account }
}

/**
 * Poll until the person answers or the code dies.
 *
 * The deadline is enforced here as well as by the server, so a server that
 * stops answering cannot leave the daemon polling forever.
 */
async function waitForApproval(input: PairHostInput, grant: DeviceCodeGrant): Promise<Answer> {
  const deadline = input.now() + grant.expiresInSeconds * 1000
  let intervalSeconds = grant.intervalSeconds

  while (input.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Each poll must follow the last by the server's interval.
    await input.sleep(intervalSeconds * 1000)

    // oxlint-disable-next-line no-await-in-loop -- One poll at a time is the grant's contract.
    const answer = await input.authorizer.poll(grant.deviceCode)
    if (answer.status === 'granted') return { status: 'paired', token: answer.token }
    if (answer.status === 'denied') return { status: 'denied' }
    if (answer.status === 'expired') return { status: 'expired' }
    if (answer.status === 'slow-down') intervalSeconds += answer.intervalSeconds
  }

  // The local deadline passed, which means the same thing the server would say.
  return { status: 'expired' }
}

/** The outcome as waiting sees it, with the token still attached to approval. */
type Answer =
  | { readonly status: 'paired'; readonly token: string }
  | { readonly status: 'denied' }
  | { readonly status: 'expired' }
