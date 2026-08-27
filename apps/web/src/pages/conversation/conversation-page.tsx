import type { ConversationState } from '@web/entities/conversation/use-conversation.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { ConversationChat } from '@web/features/conversation/components/conversation-chat.tsx'

export type ConversationPageProps = {
  readonly conversation: ConversationState
  readonly connection: HostConnection
}

/** One conversation on the paired Mac: what it said, and what to say next. */
export function ConversationPage({ conversation, connection }: ConversationPageProps) {
  return (
    <>
      {/* Spoken, not shown: the transcript is the page. */}
      <h1 className="sr-only">Conversation</h1>
      <ConversationChat
        actions={conversation.actions}
        agent={conversation.agent}
        canSend={connection.status === 'connected'}
        permissions={conversation.permissions}
        state={conversation.state}
      />
    </>
  )
}
