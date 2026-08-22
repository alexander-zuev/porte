/**
 * The Mac as a screen can describe it.
 *
 * `offline` is the Mac being away. `lost` is us having stopped trying, which
 * says nothing about the Mac. It is the only state carrying a way out, because
 * it is the only one nothing leaves on its own.
 */
export type HostConnection =
  | { readonly status: 'connecting' | 'online' | 'offline' | 'reconnecting' }
  | { readonly status: 'lost'; readonly onRetry: () => void }
