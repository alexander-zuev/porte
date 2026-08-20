import type { ConversationSummary, IsoDateTime } from '@porte/core'

/**
 * What the browser knows about its Mac, and about its own line to it.
 *
 * Three facts, kept apart because they fail apart. Our socket dropping does not
 * mean the Mac went away, and saying so would send someone to their desk for
 * nothing. While our line is down, what we hold about the Mac is the last thing
 * we heard, which is better than blanking a screen for one second.
 */
export type RelayState = {
  /** Our line to Porte. We own this one, so we see every step of it. */
  readonly relay: RelayStatus
  /**
   * The Mac, or null when we have never heard.
   *
   * There or not there, and nothing between: the relay reports whether it holds
   * the daemon's socket. The Mac's own retrying is invisible from here.
   */
  readonly mac: MacState | null
  readonly conversations: readonly ConversationSummary[]
}

export type RelayStatus = 'connecting' | 'open' | 'reconnecting' | 'failed'

export type MacState = {
  readonly online: boolean
  readonly lastSeenAt: IsoDateTime | null
}

/** Before any socket exists, including on the server. */
export const INITIAL_RELAY_STATE: RelayState = {
  relay: 'connecting',
  mac: null,
  conversations: [],
}
