import {
  createHostId,
  type PairingCode,
  type PairingDecision,
  type PairingVerdict,
} from '@porte/core'
import type { UserId } from '@porte/core'

import { Host } from '../../domain/host/host.aggregate.ts'
import type { HostRepository } from '../../domain/host/host.repository.ts'
import type { PairingAuthority } from '../ports/pairing-authority.ts'
import type { PairingOrigins } from '../ports/pairing-origins.ts'

/** Who is deciding, on which code, and how. */
export type PairingDecisionRequest = {
  readonly code: PairingCode
  readonly verdict: PairingVerdict
  readonly userId: UserId
}

/**
 * Settle a claimed pairing code.
 *
 * Approval is the only moment both halves of a host are known: the account
 * comes from whoever is signed in, and the machine from the request that asked
 * for the code. So the host is written here, not when a daemon first connects.
 */
export async function decidePairing(
  authority: PairingAuthority,
  origins: PairingOrigins,
  hosts: HostRepository,
  decision: PairingDecisionRequest,
): Promise<PairingDecision> {
  if (decision.verdict === 'deny') {
    const denied = await authority.deny(decision.code)
    await origins.forget(decision.code)
    return denied
  }

  // The record is written with the code and dropped with the decision, so its
  // absence means there is no longer an attempt to grant. Read before granting:
  // a session for a machine we cannot name is worse than a refused approval.
  const asked = await origins.find(decision.code)
  if (asked === null) return { state: 'expired' }

  const approved = await authority.approve(decision.code)
  if (approved.state !== 'done') return approved

  await hosts.save(Host.register({ id: createHostId(), userId: decision.userId, ...asked.host }))
  await origins.forget(decision.code)
  return approved
}
