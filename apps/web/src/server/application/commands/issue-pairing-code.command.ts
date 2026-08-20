import type { DeviceCodeResponse } from '@porte/core'

import type { PairingAuthority } from '../ports/pairing-authority.ts'
import type { PairingOrigins, PairingRequestRecord } from '../ports/pairing-origins.ts'

/**
 * Issue a pairing code and remember where it was asked for.
 *
 * Both belong to one moment. Only this request knows which machine wanted the
 * code, and by the time anyone approves it the headers describe the approver.
 */
export async function issuePairingCode(
  authority: PairingAuthority,
  origins: PairingOrigins,
  clientId: string,
  request: PairingRequestRecord,
): Promise<DeviceCodeResponse> {
  const issued = await authority.issue(clientId)
  await origins.record(issued.user_code, request)
  return issued
}
