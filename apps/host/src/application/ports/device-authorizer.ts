import type { HostDescriptor } from '@porte/core/client'

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
 * Being refused or running out of time is how pairing finishes, not a fault.
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
 * This machine's pairing with Porte, over its whole life.
 *
 * The daemon starts the flow and waits. Approval happens on a different device
 * entirely, which is the whole point: this machine never sees a password.
 * Ending the pairing belongs here too, because the same server that granted it
 * is the only one that can take it back.
 */
export interface DeviceAuthorizer {
  /** Ask for a code the person can approve elsewhere, naming the machine that asked. */
  requestCode(host: HostDescriptor): Promise<DeviceCodeGrant>

  /** Ask once whether approval has happened yet. */
  poll(deviceCode: string): Promise<DevicePollResult>

  /** End the pairing this token belongs to. Succeeds when it was already gone. */
  revoke(token: string): Promise<void>

  /**
   * Who approved, so the machine can say whose account it now answers to.
   *
   * The grant hands back a token and nothing else, so this is the only way the
   * daemon learns the account. Null when the server will not say, which is not
   * worth failing a pairing over.
   */
  accountOf(token: string): Promise<string | null>
}
