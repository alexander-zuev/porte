import type { Result } from 'better-result'

import type { PairingError } from '../pairing-error.ts'

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
 * Pending is the normal answer for most of the flow, so it is a state rather
 * than an error. Anything terminal comes back as a failed Result instead.
 */
export type DevicePollResult =
  | { readonly status: 'pending' }
  /** The server asked us to back off; the new interval replaces the old one. */
  | { readonly status: 'slow-down'; readonly intervalSeconds: number }
  | { readonly status: 'granted'; readonly token: string }

/**
 * The device authorization grant, from the daemon's side.
 *
 * The daemon starts the flow and waits. Approval happens on a different device
 * entirely, which is the whole point: this machine never sees a password.
 */
export interface DeviceAuthorizer {
  /** Ask for a code the person can approve elsewhere. */
  requestCode(): Promise<Result<DeviceCodeGrant, PairingError>>

  /** Ask once whether approval has happened yet. */
  poll(deviceCode: string): Promise<Result<DevicePollResult, PairingError>>
}
