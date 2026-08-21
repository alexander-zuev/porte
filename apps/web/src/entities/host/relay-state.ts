import type { IsoDateTime } from '@porte/core/client'

/**
 * What the browser knows about its Mac, and about its own line to it.
 *
 * Two facts, kept apart because they fail apart. Our socket dropping does not
 * mean the Mac went away, and saying so would send someone to their desk for
 * nothing. While our line is down, what we hold about the Mac is the last thing
 * we heard, which is better than blanking a screen for one second.
 *
 * The conversations are not here. They are server data, so they live in the
 * query cache, which the relay writes to when the Mac reports a new list.
 */
export type RelayState = {
  /** Our line to Porte. We own this one, so we see every step of it. */
  readonly line: LineStatus
  /**
   * The Mac, or null when we have never heard.
   *
   * There or not there, and nothing between: the relay reports whether it holds
   * the daemon's socket. The Mac's own retrying is invisible from here.
   */
  readonly mac: MacState | null
}

/** `lost` is the end of the line: reconnecting gave up, and nothing is coming. */
export type LineStatus = 'connecting' | 'open' | 'reconnecting' | 'lost'

export type MacState = {
  readonly online: boolean
  readonly lastSeenAt: IsoDateTime | null
}

/** Before any socket exists, including on the server. */
export const INITIAL_RELAY_STATE: RelayState = {
  line: 'connecting',
  mac: null,
}

/**
 * Whether anything sent now would arrive.
 *
 * Both facts have to hold: our line carries the message, and the Mac is there
 * to receive it. Derived rather than stored, so it cannot disagree with either.
 */
export function canReachMac(relay: RelayState): boolean {
  return relay.line === 'open' && relay.mac?.online === true
}
