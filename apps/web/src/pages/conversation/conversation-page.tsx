import type { ConversationId } from '@porte/core/client'
import { QueryErrorResetBoundary, useQueryErrorResetBoundary } from '@tanstack/react-query'
import { CatchBoundary, getRouteApi, type ErrorComponentProps } from '@tanstack/react-router'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { ConversationChat } from '@web/features/conversation/components/conversation-chat.tsx'
import { ConversationSkeleton } from '@web/features/conversation/components/conversation-skeleton.tsx'
import { ConversationFailed } from '@web/features/conversation/components/conversation-states.tsx'
import { Suspense } from 'react'

import {
  useConversation,
  type ConversationMessagesQuery,
  type OpenConversation,
} from './use-conversation.ts'

const route = getRouteApi('/_auth/conversations/$conversationId')

export type ConversationPageProps = {
  readonly connection: HostConnection
  readonly conversationId: ConversationId
  readonly messagesQuery: ConversationMessagesQuery
}

/**
 * One conversation on the paired machine: what it said, and what to say next.
 *
 * The transcript read suspends and throws inside these boundaries, so the
 * shell stays up while the page shows the skeleton or the failure in place.
 */
export function ConversationPage({
  connection,
  conversationId,
  messagesQuery,
}: ConversationPageProps) {
  return (
    <>
      {/* Spoken, not shown: the transcript is the page. */}
      <h1 className="sr-only">Conversation</h1>
      <QueryErrorResetBoundary>
        <CatchBoundary errorComponent={ReadFailed} getResetKey={() => conversationId}>
          <Suspense fallback={<ConversationSkeleton />}>
            <OpenedConversation
              connection={connection}
              conversationId={conversationId}
              messagesQuery={messagesQuery}
            />
          </Suspense>
        </CatchBoundary>
      </QueryErrorResetBoundary>
    </>
  )
}

/** The read failed. Clearing the query first makes the remount fetch again instead of rethrowing. */
function ReadFailed({ error, reset: remount }: ErrorComponentProps) {
  // From the database, so the failure can name the machine before any socket exists.
  const { host } = route.useRouteContext()
  const { reset } = useQueryErrorResetBoundary()

  return (
    <ConversationFailed
      error={error}
      host={host}
      onRetry={() => {
        reset()
        remount()
      }}
    />
  )
}

function OpenedConversation({ connection, conversationId, messagesQuery }: ConversationPageProps) {
  const conversation = useConversation(conversationId, messagesQuery)
  return <ConversationView connection={connection} conversation={conversation} />
}

export type ConversationViewProps = {
  readonly connection: HostConnection
  readonly conversation: OpenConversation
}

/** The read transcript and the composer; pure, so a story can render it from a fixture. */
export function ConversationView({ connection, conversation }: ConversationViewProps) {
  return (
    <ConversationChat
      actions={conversation.actions}
      agent={conversation.agent}
      canSend={connection.status === 'connected'}
      messages={conversation.messages}
      permissions={conversation.permissions}
      state={conversation.state}
    />
  )
}
