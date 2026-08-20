const DEFAULT_RETURN_TO = '/conversations'
const RETURN_TO_BASE = 'https://porte.invalid'

/** Sign-in search preserved through OAuth. */
export type SignInSearch = {
  readonly returnTo: string
  readonly intent?: 'pair'
}

/** Path + search + hash from a router location, never an absolute origin. */
export function locationReturnTo(location: {
  readonly href: string
  readonly pathname: string
}): string {
  if (location.href.startsWith('/')) return location.href
  const parsed = URL.parse(location.href)
  if (parsed === null) return location.pathname
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

/** Build sign-in search from the page that required authentication. */
export function signInSearchFromLocation(location: {
  readonly href: string
  readonly pathname: string
}): SignInSearch {
  const returnTo = locationReturnTo(location)
  if (location.pathname.startsWith('/pair')) return { returnTo, intent: 'pair' }
  return { returnTo }
}

/** Keep OAuth return paths on this origin. */
export function internalReturnTo(value: string | undefined): string {
  const parsed = value === undefined ? null : URL.parse(value, RETURN_TO_BASE)
  if (parsed === null || parsed.origin !== RETURN_TO_BASE) return DEFAULT_RETURN_TO
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
