import type { PairingError } from '@host/application/pairing-error.ts'
import type { Result } from 'better-result'

/** What the server hands back when a device asks to be authorized. */
export type DeviceCodeGrant = {
  /** Secret the daemon polls with. Never shown to the person. */
  readonly deviceCode: string
  /** Short code the person types on their phone. */
  readonly userCode: string
  /** Where to type it. */
  readonly verificationUri: string
  /** Seconds the daemon must wait between polls. */
  readonly intervalSeconds: number
  /** Seconds until the code stops working. */
  readonly expiresInSeconds: number
}

/**
 * Outcome of one poll.
 *
 * Every answer the grant defines is a state, including the two that end it.
 * Being refused or running out of time is how pairing finishes, not a fault,
 * so a failed Result is left for a server we cannot reach or cannot parse.
 */
export type DevicePollResult =
  | { readonly status: 'pending' }
  /** The server asked us to back off; the new interval replaces the old one. */
  | { readonly status: 'slow-down'; readonly intervalSeconds: number }
  | { readonly status: 'granted'; readonly token: string }
  /** The person said no. */
  | { readonly status: 'denied' }
  /** Nobody answered before the code died. */
  | { readonly status: 'expired' }

/**
 * This Mac's pairing with Porte, over its whole life.
 *
 * The daemon starts the flow and waits. Approval happens on a different device
 * entirely, which is the whole point: this machine never sees a password.
 * Ending the pairing belongs here too, because the same server that granted it
 * is the only one that can take it back.
 */
export interface DeviceAuthorizer {
  /** Ask for a code the person can approve elsewhere. */
  requestCode(): Promise<Result<DeviceCodeGrant, PairingError>>

  /** Ask once whether approval has happened yet. */
  poll(deviceCode: string): Promise<Result<DevicePollResult, PairingError>>

  /** End the pairing this token belongs to. Succeeds when it was already gone. */
  revoke(token: string): Promise<Result<void, PairingError>>
}
