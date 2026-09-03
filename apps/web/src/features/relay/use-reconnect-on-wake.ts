import { useEffect } from 'react'

/** The socket facts this hook reads; every relay socket is a PartySocket and has them. */
export type WakeableSocket = {
  readonly readyState: number
  reconnect(): void
}

/**
 * Reconnect at once when the browser comes back online, or the page is shown
 * again, and the socket is not open.
 *
 * PartySocket listens to neither event: it waits out its retry delay, and a
 * socket a background tab or a sleeping phone left dead never closes on its
 * own. `reconnect()` resets the retry count, so this connect has no delay.
 */
export function useReconnectOnWake(socket: WakeableSocket): void {
  useEffect(() => {
    const wake = (): void => {
      if (document.visibilityState !== 'visible') return
      if (socket.readyState === WebSocket.OPEN) return
      socket.reconnect()
    }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [socket])
}
