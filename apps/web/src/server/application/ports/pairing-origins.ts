/** Where and when a pairing code was asked for. */
export type PairingRequestRecord = {
  readonly ipAddress: string
  readonly country: string | null
  readonly city: string | null
  readonly requestedAt: Date
}

/**
 * Remembers where each pairing code came from.
 *
 * Only the request moment can answer that: by the time someone approves, the
 * headers describe whoever is approving. A record is written when the code is
 * issued and dropped once the code is decided.
 */
export interface PairingOrigins {
  record(userCode: string, request: PairingRequestRecord): Promise<void>
  find(userCode: string): Promise<PairingRequestRecord | null>
  forget(userCode: string): Promise<void>
}
