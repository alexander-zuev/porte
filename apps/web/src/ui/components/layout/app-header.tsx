import { LaptopIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useChildMatches } from '@tanstack/react-router'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useHostConnection } from '@web/lib/host/use-host-connection.ts'
import { HostStatus } from '@web/ui/components/host-status.tsx'
import { AppMenu } from '@web/ui/components/layout/app-menu.tsx'
import { ShellHeader } from '@web/ui/components/layout/shell-header.tsx'
import { Logo } from '@web/ui/components/logo.tsx'

/**
 * The bar above every signed-in page.
 *
 * The same `ShellHeader` the public site uses, so the wordmark does not move
 * when somebody signs in. The Mac is named in the centre because it is the one
 * thing every page here is about, and it is read straight from the cache rather
 * than passed down: no page owns this bar.
 */
export function AppHeader() {
  return (
    <ShellHeader
      action={<AppMenu />}
      center={<RemoteHost />}
      lead={
        <Link aria-label="Porte home" to="/">
          <Logo size="sm" />
        </Link>
      }
      measure="column"
    />
  )
}

/**
 * Which Mac this is, and whether it is there.
 *
 * Only on the screens that control it. Settings and pairing can read the same
 * Mac — settings names it in full — but neither is remote-controlling one, and
 * a bar that said so would be describing the wrong thing.
 *
 * The router is asked rather than a context: the header renders above the
 * layout that owns the Mac, so nothing below it can hand anything up.
 */
function RemoteHost() {
  const controllingHost = useChildMatches({
    select: (matches) => matches.some((match) => match.routeId === '/_auth/_relay'),
  })
  const owned = useQuery(hostQueries.forAccount())
  const connection = useHostConnection()

  if (!controllingHost) return null
  if (owned.data?.state !== 'paired') return null

  return (
    <div className="flex min-w-0 flex-col items-center">
      <strong>Remote</strong>
      <small className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <HostStatus connection={connection} />
        <LaptopIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{owned.data.host.name}</span>
      </small>
    </div>
  )
}
