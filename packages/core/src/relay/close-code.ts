/**
 * Close codes, as RFC 6455 allows them to be sent.
 *
 * A peer never sends 1004, 1005, 1006 or 1015: those are what the local API
 * reports when there was no code, or no clean close at all. Section 7.4.1 says
 * they must not go into a close frame, so echoing one back turns an ordinary
 * disconnect into a protocol error.
 */
const RESERVED = new Set([1004, 1005, 1006, 1015])

/** Ranges 7.4.2 leaves open: registered codes, then private ones. */
const REGISTERED = { from: 3000, to: 3999 } as const
const PRIVATE = { from: 4000, to: 4999 } as const

/** What the protocol itself defines, minus the reserved values above. */
const DEFINED = { from: 1000, to: 1014 } as const

/**
 * The relay ending a pairing, sent to every socket it holds.
 *
 * Private range on purpose: the Agents client only stops reconnecting on 1008
 * or 4000–4999, and a socket whose pairing is gone must not come back on its own.
 */
export const PAIRING_ENDED_CLOSE = { code: 4001, reason: 'pairing ended' } as const

/**
 * The nearest code that may actually be sent.
 *
 * Anything reserved or outside the permitted ranges becomes a normal closure,
 * because the alternative is failing a disconnect that already happened.
 */
export function sendableCloseCode(code: number): number {
  return isSendableCloseCode(code) ? code : 1000
}

export function isSendableCloseCode(code: number): boolean {
  if (!Number.isInteger(code) || RESERVED.has(code)) return false

  return within(code, DEFINED) || within(code, REGISTERED) || within(code, PRIVATE)
}

function within(code: number, range: { from: number; to: number }): boolean {
  return code >= range.from && code <= range.to
}
