import type { ConversationState } from '@web/entities/conversation/use-conversation.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { ConversationChat } from '@web/features/conversation/components/conversation-chat.tsx'
import { ConversationSkeleton } from '@web/features/conversation/components/conversation-skeleton.tsx'

export type ConversationPageProps = {
  readonly conversation: ConversationState
  readonly connection: HostConnection
}

/** One conversation on the paired Mac: what it said, and what to say next. */
export function ConversationPage(props: ConversationPageProps) {
  return <ConversationBody {...props} />
}

function ConversationBody({ conversation, connection }: ConversationPageProps) {
  if (conversation.status === 'pending') return <ConversationSkeleton />

  return (
    <ConversationChat
      actions={conversation.actions}
      agent={conversation.agent}
      canSend={connection.status === 'connected'}
      permissions={conversation.permissions}
      state={conversation.state}
    />
  )
}
