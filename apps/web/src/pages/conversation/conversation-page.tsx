import type { ConversationId, PairedHost } from '@porte/core/client'
import type { ConversationView } from '@web/entities/conversation/use-conversation.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { ConversationChat } from '@web/features/conversation/components/conversation-chat.tsx'
import { ConversationHeader } from '@web/features/conversation/components/conversation-header.tsx'
import {
  ConversationFailed,
  ConversationOpening,
} from '@web/features/conversation/components/conversation-states.tsx'
export type ConversationPageProps = {
  readonly conversationId: ConversationId
  readonly view: ConversationView
  readonly host: PairedHost
  readonly connection: HostConnection
  /** Both halves have to hold, so the page is handed the answer rather than the facts. */
  readonly canSend: boolean
}

/** One conversation on the paired Mac: what it said, and what to say next. */
export function ConversationPage({
  conversationId,
  view,
  host,
  connection,
  canSend,
}: ConversationPageProps) {
  const header = (
    <ConversationHeader
      connection={connection}
      cwd={view.status === 'ready' ? view.conversation.cwd : null}
      hostName={host.name}
      title={view.status === 'ready' ? view.conversation.title : 'Opening'}
    />
  )

  return (
    <>
      {header}
      <ConversationBody canSend={canSend} conversationId={conversationId} view={view} />
    </>
  )
}

function ConversationBody({
  conversationId,
  view,
  canSend,
}: Pick<ConversationPageProps, 'conversationId' | 'view' | 'canSend'>) {
  if (view.status === 'pending') return <ConversationOpening />

  if (view.status === 'failed') {
    return <ConversationFailed error={view.error} onRetry={view.onRetry} />
  }

  return (
    <ConversationChat
      actions={view.actions}
      canSend={canSend}
      conversationId={conversationId}
      history={view.messages}
      permissions={view.permissions}
      readingOlder={view.readingOlder}
      resuming={view.resuming}
      transport={view.transport}
      onReadOlder={view.onReadOlder}
    />
  )
}
