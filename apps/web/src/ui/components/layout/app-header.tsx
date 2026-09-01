import { LaptopIcon } from '@phosphor-icons/react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useChildMatches } from '@tanstack/react-router'
import { conversationQueries } from '@web/entities/conversation/conversation-queries.ts'
import { conversationDisplayTitle } from '@web/entities/conversation/conversation-title.ts'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useHostConnection } from '@web/features/relay/use-host-connection.ts'
import { HostStatus } from '@web/ui/components/host-status.tsx'
import { AppMenu } from '@web/ui/components/layout/app-menu.tsx'
import { ShellHeader } from '@web/ui/components/layout/shell-header.tsx'
import { Logo } from '@web/ui/components/logo.tsx'

/**
 * The bar above every signed-in page.
 *
 * The same `ShellHeader` the public site uses, so the wordmark does not move
 * when somebody signs in. The machine is named in the centre because it is the one
 * thing every page here is about, and it is read straight from the cache rather
 * than passed down: no page owns this bar.
 */
export function AppHeader() {
  const controllingHost = useChildMatches({
    select: (matches) => matches.some((match) => match.routeId.startsWith('/_auth/conversations')),
  })

  return (
    <ShellHeader
      action={<AppMenu />}
      center={controllingHost ? <RemoteHost /> : null}
      lead={
        // Home for someone signed in is their conversations, not the page that
        // sells them Porte. The public bar keeps the wordmark pointing at `/`.
        <Link aria-label="Your conversations" to="/conversations">
          <Logo size="sm" />
        </Link>
      }
      measure="column"
    />
  )
}

const CONVERSATION_ROUTE = '/_auth/conversations/$conversationId'

/**
 * What this screen is about, and the machine behind it.
 *
 * Inside a conversation the bar names the conversation, the way a chat app
 * does; on the list it names the job. Only on the screens that control the
 * machine: settings and pairing can read the same machine, but neither is remote-
 * controlling one, and a bar that said so would be describing the wrong thing.
 */
function RemoteHost() {
  const owned = useQuery(hostQueries.forAccount())
  const connection = useHostConnection()
  const conversationId = useChildMatches({
    select: (matches) =>
      matches.find((match) => match.routeId === CONVERSATION_ROUTE)?.params.conversationId,
  })
  // From the list already in the cache: the page never fetches a title on its own.
  const title = useInfiniteQuery({
    ...conversationQueries.list(),
    enabled: conversationId !== undefined,
    select: (data) =>
      data.pages
        .flatMap((page) => page.conversations)
        .find((conversation) => conversation.id === conversationId)?.title,
  })

  if (owned.data?.state !== 'paired') return null

  const heading = conversationId === undefined ? 'Remote' : conversationHeading(title.data)

  return (
    <div className="flex min-w-0 flex-col items-center">
      <strong className="max-w-full truncate">{heading}</strong>
      <small className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <HostStatus connection={connection.status} />
        <LaptopIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{owned.data.host.name}</span>
      </small>
    </div>
  )
}

/** `undefined` is a list not yet cached; an empty title is a conversation the agent has not named. */
function conversationHeading(title: string | undefined): string {
  return title === undefined ? 'Conversation' : conversationDisplayTitle(title)
}
