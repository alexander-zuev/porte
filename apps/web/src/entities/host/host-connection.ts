/**
 * The end-to-end connection from this browser to the paired Mac, from two facts:
 * the relay socket (`readyState`) and what the relay reports about the Mac.
 *
 * - `loading`: the relay has not answered yet (no state frame). Spinner.
 * - `connecting`: the socket dropped and is retrying on its own. Flashing dot.
 * - `connected`: socket open, Mac online.
 * - `offline`: socket open, Mac not connected to the relay. Only the Mac can fix it.
 */
export type HostConnection =
  | { readonly status: 'loading' }
  | { readonly status: 'connecting' }
  | { readonly status: 'connected' }
  | { readonly status: 'offline' }

export type HostConnectionStatus = HostConnection['status']
