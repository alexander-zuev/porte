import type { ConversationId, PairedHost } from '@porte/core/client'
import type { ConversationView } from '@web/entities/conversation/use-conversation.ts'
import { canReachMac, type RelayState } from '@web/entities/host/relay-state.ts'
import { ConversationChat } from '@web/features/conversation/components/conversation-chat.tsx'
import {
  ConversationHeader,
  type ConversationConnection,
} from '@web/features/conversation/components/conversation-header.tsx'
import {
  ConversationFailed,
  ConversationOpening,
} from '@web/features/conversation/components/conversation-states.tsx'
export type ConversationPageProps = {
  readonly conversationId: ConversationId
  readonly view: ConversationView
  readonly host: PairedHost
  readonly relay: RelayState
}

/** One conversation on the paired Mac: what it said, and what to say next. */
export function ConversationPage({ conversationId, view, host, relay }: ConversationPageProps) {
  const header = (
    <ConversationHeader
      connection={connectionOf(relay)}
      cwd={view.status === 'ready' ? view.conversation.cwd : null}
      hostName={host.name}
      title={view.status === 'ready' ? view.conversation.title : 'Opening'}
    />
  )

  return (
    <>
      {header}
      <ConversationBody conversationId={conversationId} relay={relay} view={view} />
    </>
  )
}

function ConversationBody({ conversationId, view, relay }: Omit<ConversationPageProps, 'host'>) {
  if (view.status === 'pending') return <ConversationOpening />

  if (view.status === 'failed') {
    return <ConversationFailed error={view.error} onRetry={view.onRetry} />
  }

  return (
    <ConversationChat
      actions={view.actions}
      canSend={canReachMac(relay)}
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

function connectionOf(relay: RelayState): ConversationConnection {
  if (relay.line === 'reconnecting') return 'reconnecting'
  if (relay.mac === null) return 'loading'

  return relay.mac.online ? 'online' : 'offline'
}
