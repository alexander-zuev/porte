import type { PairedHost } from '@porte/core/client'
import type { ConversationList } from '@web/entities/conversation/conversation-list.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { NoConversationsYet } from '@web/features/conversations/components/conversation-list-states.tsx'
import { ConversationsFailure } from '@web/features/conversations/components/conversations-failure.tsx'
import { ProjectListSkeleton } from '@web/features/conversations/components/project-list-skeleton.tsx'
import { ProjectList } from '@web/features/conversations/components/project-list.tsx'
import type { CreateConversation } from '@web/features/conversations/hooks/use-create-conversation.ts'
import { StartPorteOnMachine } from '@web/features/host/components/start-porte-on-machine.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

export type ConversationsPageProps = {
  /** From the database, so the machine has a name before any socket exists. */
  readonly host: PairedHost
  readonly conversationList: ConversationList
  readonly connection: HostConnection
  readonly create: CreateConversation
}

/**
 * Everything a signed-in account with a paired machine sees. Renders, never waits.
 *
 * Which machine this is belongs to `AppHeader`, which every page here shares. The
 * page is the list and nothing above it.
 */
export function ConversationsPage(props: ConversationsPageProps) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      {/* Spoken, not shown: the list is the page, and a title above it would say so twice. */}
      <h1 className="sr-only">Conversations</h1>
      {body(props)}
    </div>
  )
}

/**
 * An away machine is the whole screen, even though the list would render.
 *
 * The relay holds a copy, so there is something to show. It is not shown: every
 * row on it opens a conversation that cannot be read, and offering a list that
 * does nothing when tapped is worse than saying where the machine went.
 */
function body({ host, connection, conversationList, create }: ConversationsPageProps) {
  // Opening the line and reading the list are one wait to the person watching,
  // so they get one skeleton rather than a spinner that hands over to another.
  if (connection.status === 'loading') return <ProjectListSkeleton />

  if (connection.status === 'offline') {
    return <StartPorteOnMachine hostName={host.name} lastSeenAt={host.lastSeenAt} />
  }

  if (conversationList.status === 'failed') {
    return (
      <ConversationsFailure error={conversationList.error} onRetry={conversationList.onRetry} />
    )
  }

  if (conversationList.status === 'pending') return <ProjectListSkeleton />
  if (conversationList.conversations.length === 0) return <NoConversationsYet />

  return (
    <>
      <ProjectList conversations={conversationList.conversations} create={create} />
      {conversationList.hasMore ? (
        <Button
          className="min-h-11 w-full"
          disabled={conversationList.isLoadingMore}
          variant="ghost"
          onClick={conversationList.onLoadMore}
        >
          {conversationList.isLoadingMore ? <Spinner /> : 'Show more'}
        </Button>
      ) : null}
    </>
  )
}
