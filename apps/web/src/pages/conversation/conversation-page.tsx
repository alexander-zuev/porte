import type { PairedHost } from '@porte/core/client'
import type { ConversationState } from '@web/entities/conversation/use-conversation.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { ConversationChat } from '@web/features/conversation/components/conversation-chat.tsx'
import { ConversationSkeleton } from '@web/features/conversation/components/conversation-skeleton.tsx'
import { ConversationFailed } from '@web/features/conversation/components/conversation-states.tsx'

export type ConversationPageProps = {
  readonly conversation: ConversationState
  readonly host: PairedHost
  readonly connection: HostConnection
}

/** One conversation on the paired Mac: what it said, and what to say next. */
export function ConversationPage(props: ConversationPageProps) {
  return <ConversationBody {...props} />
}

function ConversationBody({ conversation, connection, host }: ConversationPageProps) {
  if (conversation.status === 'pending') return <ConversationSkeleton />

  if (conversation.status === 'failed') {
    return (
      <ConversationFailed
        connection={connection}
        error={conversation.error}
        host={host}
        onRetry={conversation.onRetry}
      />
    )
  }

  return (
    <ConversationChat
      key={conversation.identity.id}
      actions={conversation.actions}
      agent={conversation.agent}
      canSend={connection.status === 'connected'}
      history={conversation.messages}
      permissions={conversation.permissions}
      state={conversation.state}
      readingOlder={conversation.readingOlder}
      onReadOlder={conversation.onReadOlder}
    />
  )
}
