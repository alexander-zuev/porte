import type { PairedHost } from '@porte/core/client'
import type { ConversationState } from '@web/entities/conversation/use-conversation.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { ConversationChat } from '@web/features/conversation/components/conversation-chat.tsx'
import { ConversationSkeleton } from '@web/features/conversation/components/conversation-skeleton.tsx'
import { ConversationFailed } from '@web/features/conversation/components/conversation-states.tsx'

export type ConversationPageProps = {
  /** From the database, so a failure can name the Mac before any socket exists. */
  readonly host: PairedHost
  readonly conversation: ConversationState
  readonly connection: HostConnection
}

/** One conversation on the paired Mac: what it said, and what to say next. */
export function ConversationPage(props: ConversationPageProps) {
  return (
    <>
      {/* Spoken, not shown: the transcript is the page. */}
      <h1 className="sr-only">Conversation</h1>
      {body(props)}
    </>
  )
}

function body({ host, conversation, connection }: ConversationPageProps) {
  if (conversation.status === 'pending') return <ConversationSkeleton />

  if (conversation.status === 'failed') {
    return (
      <ConversationFailed error={conversation.error} host={host} onRetry={conversation.onRetry} />
    )
  }

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
