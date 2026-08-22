import type { ConversationList } from '@web/entities/conversation/conversation-list.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import {
  LookingForMac,
  NoConversationsYet,
  ReadingConversations,
  StartPorteOnMac,
} from '@web/features/conversations/components/conversation-list-states.tsx'
import { ConversationsFailure } from '@web/features/conversations/components/conversations-failure.tsx'
import { ProjectList } from '@web/features/conversations/components/project-list.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

export type ConversationsPageProps = {
  readonly conversationList: ConversationList
  readonly connection: HostConnection
}

/**
 * Everything a signed-in account with a paired Mac sees. Renders, never waits.
 *
 * Which Mac this is belongs to `AppHeader`, which every page here shares. The
 * page is the list and nothing above it.
 */
export function ConversationsPage({ conversationList, connection }: ConversationsPageProps) {
  return <div className="flex flex-1 flex-col gap-2">{body(connection, conversationList)}</div>
}

/**
 * A list we hold is shown; otherwise the line explains itself before the read does.
 *
 * The relay keeps its own copy, so a Mac that is away still has a history worth
 * reading, and the header carries the connection badge either way. With nothing
 * to show, a dead line is the better explanation of a failed read.
 */
function body(connection: HostConnection, conversationList: ConversationList) {
  if (conversationList.status === 'ready' && conversationList.conversations.length > 0) {
    return (
      <>
        <ProjectList conversations={conversationList.conversations} />
        {conversationList.hasMore ? (
          <Button
            className="min-h-11 w-full"
            disabled={conversationList.isLoadingMore}
            variant="ghost"
            onClick={conversationList.onLoadMore}
          >
            {conversationList.isLoadingMore ? <Spinner /> : 'Load older conversations'}
          </Button>
        ) : null}
      </>
    )
  }

  if (connection === 'loading') return <LookingForMac />

  if (conversationList.status === 'failed') {
    return (
      <ConversationsFailure error={conversationList.error} onRetry={conversationList.onRetry} />
    )
  }

  if (conversationList.status === 'pending') return <ReadingConversations />
  if (connection === 'offline') return <StartPorteOnMac />

  return <NoConversationsYet />
}
