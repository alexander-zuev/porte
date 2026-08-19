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
