import type { DeviceCodeResponse, PairingCode, PairingDecision } from '@porte/core'

/**
 * The party that issues pairing codes and turns one into a session.
 *
 * Porte does not own the code's life. An external authorization server does,
 * so this is a boundary, not a repository: it converts that server's refusals
 * into states once, and nothing above it sees a transport error.
 */
/**
 * Where a pairing code stands, as the authority sees it.
 *
 * Narrower than what the screen receives: the authority knows the code, not
 * where it was asked for. Joining the two is the claim command's job.
 */
export type PairingCodeStatus =
  | { state: 'claimed' }
  | { state: 'invalid' }
  | { state: 'expired' }
  | { state: 'already-decided' }

export interface PairingAuthority {
  /** Issue a fresh code for a device to display. Wire shape, straight through. */
  issue(clientId: string): Promise<DeviceCodeResponse>

  /** Bind a pending code to the caller's account. Never decides it. */
  claim(code: PairingCode): Promise<PairingCodeStatus>

  /** Let the waiting machine have a session on the caller's account. */
  approve(code: PairingCode): Promise<PairingDecision>

  /** Refuse the waiting machine. The code cannot be used again. */
  deny(code: PairingCode): Promise<PairingDecision>
}
