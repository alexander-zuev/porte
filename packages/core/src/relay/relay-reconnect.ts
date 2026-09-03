/**
 * How fast a relay socket comes back, on the Host and in the browser.
 *
 * PartySocket option names on purpose: both sides spread this into it. Its
 * defaults wait 3 s before the first retry and grow to 10 s, which turns a
 * one-second blip into a 3–10 s "Reconnecting". Retries: 0.2, 0.4, 0.8, 1.6,
 * 3.2, then 5 s. `minUptime` is how long a socket must stay open before the
 * next drop counts as a fresh start rather than one more retry.
 */
export const RELAY_RECONNECT = {
  minReconnectionDelay: 200,
  reconnectionDelayGrowFactor: 2,
  maxReconnectionDelay: 5_000,
  minUptime: 2_000,
} as const
