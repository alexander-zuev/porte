import { deleteCookie } from '@tanstack/react-start/server'

/**
 * Better Auth splits its cookie across a name, a `__Secure-` twin, and numbered
 * chunks for the larger payloads. Leaving any behind re-presents a dead session
 * on the next request, which fails the same way and looks like a broken account.
 */
const STALE_COOKIE_NAMES = [
  'session_token',
  'session_data',
  'account_data',
  'dont_remember',
] as const

export function clearStaleSessionCookies(): void {
  for (const suffix of STALE_COOKIE_NAMES) {
    const base = `better-auth.${suffix}`
    const names = [base, `__Secure-${base}`]

    for (const name of names) {
      deleteCookie(name, { path: '/' })
      // Chunked payloads land beside the base name; a missed chunk resurrects it.
      for (let chunk = 0; chunk < 10; chunk++) deleteCookie(`${name}.${chunk}`, { path: '/' })
    }
  }
}
