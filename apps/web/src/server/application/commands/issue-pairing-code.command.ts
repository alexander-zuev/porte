import type { DeviceCodeResponse, HostDescriptor } from '@porte/core'

import type { PairingAuthority } from '../ports/pairing-authority.ts'
import type { PairingOrigins, RequestOrigin } from '../ports/pairing-origins.ts'

/**
 * What a device tells us when it asks for a code.
 *
 * Declared here rather than by the route, so the entrypoint's job is to
 * produce this from an HTTP request and nothing more. What gets stored is this
 * command's decision, not the caller's.
 */
export type PairingCodeRequest = {
  readonly clientId: string
  readonly host: HostDescriptor
  readonly origin: RequestOrigin
  readonly requestedAt: Date
}

/**
 * Issue a pairing code, and remember what asked for it.
 *
 * Both belong to one moment. Only this request knows which machine wanted the
 * code, and by the time anyone approves it the headers describe the approver.
 */
export async function issuePairingCode(
  authority: PairingAuthority,
  origins: PairingOrigins,
  asked: PairingCodeRequest,
): Promise<DeviceCodeResponse> {
  const issued = await authority.issue(asked.clientId)

  // The client id identifies the caller, so it is spent here and never stored.
  await origins.record(issued.user_code, {
    host: asked.host,
    origin: asked.origin,
    requestedAt: asked.requestedAt,
  })
  return issued
}
