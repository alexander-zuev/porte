import type { ConversationSummary, HostSnapshot, PairedHost } from '@porte/core'

/**
 * What `/conversations` renders, as one value.
 *
 * A projection of the relay's snapshot, not a second copy of it: every state
 * below is decided by `status` and `catalog` together, which is why they are
 * read here rather than switched on in three places. Only `connecting` and
 * `failed` are the client's own, and neither is a fact about the Mac.
 *
 * Pairing is absent on purpose. It is durable and server-known, so the route
 * redirects on it before any of this is reached.
 */
export type HostConnection =
  /** No answer yet. Never "offline" this early, or a healthy Mac flashes an error. */
  | { readonly state: 'connecting' }
  /** Reachable, with nothing to open. */
  | { readonly state: 'empty' }
  | { readonly state: 'ready'; readonly conversations: readonly ConversationSummary[] }
  /** Not reachable, and no daemon ever synced a list. */
  | { readonly state: 'offline'; readonly lastSeenAt: string | null }
  /** Not reachable, but the relay still holds the last list it was told about. */
  | {
      readonly state: 'stale'
      readonly lastSeenAt: string | null
      readonly conversations: readonly ConversationSummary[]
    }
  | { readonly state: 'failed'; readonly reason: string }

/**
 * Collapse one snapshot into the single value the route switches on.
 *
 * Pure, so the whole grid of status against catalog can be tested without a
 * socket. An unreachable Mac keeps its list because discarding one the relay is
 * already holding makes the page poorer than the data behind it.
 */
export function toHostConnection(
  snapshot: HostSnapshot,
  lastSeenAt: string | null,
): HostConnection {
  const conversations =
    snapshot.catalog.state === 'never-synced' ? [] : snapshot.catalog.conversations

  if (snapshot.status === 'offline') {
    return conversations.length === 0
      ? { state: 'offline', lastSeenAt }
      : { state: 'stale', lastSeenAt, conversations }
  }

  return conversations.length === 0 ? { state: 'empty' } : { state: 'ready', conversations }
}

/**
 * Follow the account's Mac while the page is open.
 *
 * One `host.snapshot` answers reachable and which conversations together, and
 * `host.status` and `conversations.changed` push every change after that.
 * Conversations stay out of the query cache: they arrive by push, and a second
 * copy is a second thing that can disagree.
 */
export function useHostConnection(host: PairedHost): HostConnection {
  // No relay client in the browser yet, so unreachable is the honest answer.
  // Only this body changes once the daemon can authenticate.
  return toHostConnection(
    { status: 'offline', catalog: { state: 'never-synced' } },
    host.lastSeenAt,
  )
}
