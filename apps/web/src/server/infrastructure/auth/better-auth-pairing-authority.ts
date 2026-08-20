import {
  createLogger,
  DeviceDecisionErrorSchema,
  type DeviceDecisionError,
  type PairingClaim,
  type PairingCode,
  type PairingDecision,
} from '@porte/core'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { APIError } from 'better-auth/api'

import type { PairingAuthority } from '../../application/ports/pairing-authority'
import type { AuthInstance } from '../app-deps.ts'

const logger = createLogger('pairing-authority')

/** Device authorization plugin adapter. Request-scoped: reads the caller's headers. */
export class BetterAuthPairingAuthority implements PairingAuthority {
  constructor(private readonly auth: () => AuthInstance) {}

  /** `deviceVerify` also writes: it binds a pending code to the caller. */
  async claim(code: PairingCode): Promise<PairingClaim> {
    try {
      const verified = await this.auth().api.deviceVerify({
        query: { user_code: code },
        headers: getRequestHeaders(),
      })
      return verified.status === 'pending' ? { state: 'claimed' } : { state: 'already-decided' }
    } catch (cause) {
      switch (refusal(cause)) {
        case 'expired_token':
          return { state: 'expired' }
        case 'invalid_request':
          return { state: 'invalid' }
        // requireAuth passed on these headers, so disagreement is our bug.
        case 'unauthorized':
          throw cause
        default:
          throw cause
      }
    }
  }

  async approve(code: PairingCode): Promise<PairingDecision> {
    return decide(() =>
      this.auth().api.deviceApprove({ body: { userCode: code }, headers: getRequestHeaders() }),
    )
  }

  async deny(code: PairingCode): Promise<PairingDecision> {
    return decide(() =>
      this.auth().api.deviceDeny({ body: { userCode: code }, headers: getRequestHeaders() }),
    )
  }
}

/** Shared by approve and deny: they fail in exactly the same ways. */
async function decide(send: () => Promise<{ success: boolean }>): Promise<PairingDecision> {
  try {
    await send()
    return { state: 'done' }
  } catch (cause) {
    switch (refusal(cause)) {
      case 'expired_token':
        return { state: 'expired' }
      // Returned as data, so no error boundary records it. Logged here only.
      case 'access_denied':
        logger.warn('pairing_code_not_owned')
        return { state: 'not-yours' }
      case 'unauthorized':
        throw cause
      // Unknown, unclaimed, and decided all arrive here; all mean spent.
      case 'invalid_request':
        return { state: 'already-decided' }
      default:
        throw cause
    }
  }
}

/** The plugin's refusal code, or null when the failure came from elsewhere. */
function refusal(cause: unknown): DeviceDecisionError['error'] | null {
  if (!(cause instanceof APIError)) return null

  const parsed = DeviceDecisionErrorSchema.safeParse(cause.body)
  return parsed.success ? parsed.data.error : null
}
