const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Format an ISO timestamp for reading.
 *
 * The result depends on the viewer's locale and time zone, so a server render
 * and a client render can differ. Mark the element `suppressHydrationWarning`.
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return DATE_TIME.format(date)
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** Largest unit first, so anything past a threshold is counted in the next one up. */
const UNITS = [
  { unit: 'year', seconds: 31_536_000 },
  { unit: 'month', seconds: 2_592_000 },
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3600 },
  { unit: 'minute', seconds: 60 },
] as const satisfies readonly { unit: Intl.RelativeTimeFormatUnit; seconds: number }[]

/**
 * How long ago, in the coarsest unit that still says something.
 *
 * "19 hours ago" answers "is it worth waiting" in a way a timestamp does not.
 * Locale and time zone dependent like `formatDateTime`, so mark the element
 * `suppressHydrationWarning`.
 */
export function formatTimeAgo(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  const elapsed = Math.round((Date.now() - date.getTime()) / 1000)
  if (elapsed < 60) return 'just now'

  for (const { unit, seconds } of UNITS) {
    if (elapsed >= seconds) return RELATIVE.format(-Math.floor(elapsed / seconds), unit)
  }

  return 'just now'
}
