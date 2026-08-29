/** Why the relay socket dropped, as far as the socket can tell. */
export type RelayDropCause = 'server-unreachable' | 'connection-lost'

/** What the control socket is doing, for the person watching `porte up`. */
export type RelayStatus =
  | { readonly type: 'connecting' }
  | { readonly type: 'connected'; readonly attempt: number }
  | { readonly type: 'reconnecting'; readonly attempt: number; readonly cause: RelayDropCause }

export type RelayStatusListener = (status: RelayStatus) => void
