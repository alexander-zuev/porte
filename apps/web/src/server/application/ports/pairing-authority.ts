import type { PairingClaim, PairingCode, PairingDecision } from '@porte/core'

/**
 * The party that issues pairing codes and turns one into a session.
 *
 * Porte does not own the code's life. An external authorization server does,
 * so this is a boundary, not a repository: it converts that server's refusals
 * into states once, and nothing above it sees a transport error.
 */
export interface PairingAuthority {
  /** Bind a pending code to the caller's account. Never decides it. */
  claim(code: PairingCode): Promise<PairingClaim>

  /** Let the waiting Mac have a session on the caller's account. */
  approve(code: PairingCode): Promise<PairingDecision>

  /** Refuse the waiting Mac. The code cannot be used again. */
  deny(code: PairingCode): Promise<PairingDecision>
}
