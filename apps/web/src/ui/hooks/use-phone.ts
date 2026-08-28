import { useSyncExternalStore } from 'react'

/** Tailwind's `md`: the app switches from a phone to a desktop layout here. */
const QUERY = '(width < 48rem)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY)
  query.addEventListener('change', onChange)
  return () => {
    query.removeEventListener('change', onChange)
  }
}

/**
 * Report whether the screen is a phone. Server renders assume desktop, so a
 * branch on this must paint the same trigger both ways until the client runs.
 */
export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
