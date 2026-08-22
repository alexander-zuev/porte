/**
 * Whether the Mac is reachable, as a screen says it.
 *
 * The Mac only. Our own socket is a separate fact, and reporting its blips here
 * would send someone to their desk for nothing.
 */
export type HostConnection = 'loading' | 'online' | 'offline'
