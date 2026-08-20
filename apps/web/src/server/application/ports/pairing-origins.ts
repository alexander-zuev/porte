import type { HostDescriptor } from '@porte/core'

/** Where a request reached Porte from, as the edge resolved it. */
export type RequestOrigin = {
  readonly ipAddress: string
  /** Two-letter code and city. Either may be absent. */
  readonly country: string | null
  readonly city: string | null
}

/** What asked for a pairing code, from where, and when. */
export type PairingRequestRecord = {
  /** As the machine named itself. */
  readonly host: HostDescriptor
  readonly origin: RequestOrigin
  readonly requestedAt: Date
}

/**
 * Remembers what asked for each pairing code and where it came from.
 *
 * Only the request moment can answer either: by the time someone approves, the
 * headers describe whoever is approving. A record is written when the code is
 * issued and dropped once the code is decided.
 */
export interface PairingOrigins {
  record(userCode: string, request: PairingRequestRecord): Promise<void>
  find(userCode: string): Promise<PairingRequestRecord | null>
  forget(userCode: string): Promise<void>

  /** Drop every request made before this moment. Answers how many it dropped. */
  forgetRequestedBefore(moment: Date): Promise<number>
}
