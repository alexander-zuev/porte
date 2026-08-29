/**
 * How long a cancelled prompt may keep running before the Host closes the
 * agent session and finishes the turn itself (plan chunk 1.4).
 */
export const CANCEL_DEADLINE_MS = 15_000

/** How long a conversation may sit with no running turn before it leaves this process (plan §5.9). */
export const IDLE_EVICTION_MS = 30 * 60_000
