/** The end-to-end connection from this browser to the paired Mac. */
export type HostConnection =
  | { readonly status: 'loading' }
  | { readonly status: 'connected' }
  | {
      readonly status: 'disconnected'
      readonly reconnecting: boolean
      readonly reconnect: () => void
    }

/** The connection status without its reconnect action. */
export type HostConnectionStatus = HostConnection['status']
