import type { ConversationId, ConversationIdentity } from '@porte/core/client'
import { useRelay } from '@web/entities/host/relay-context.tsx'
import type { ChatTransport, UIMessage } from 'ai'
import { useMemo } from 'react'

import { PorteChatTransport } from './porte-chat-transport.ts'
import { useConversationHistory } from './use-conversation-history.ts'
import { usePendingPermissions, type ConversationPermission } from './use-pending-permissions.ts'

/** Everything one conversation screen renders, in the three states a read can be in. */
export type ConversationView =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly error: unknown; readonly onRetry: () => void }
  | {
      readonly status: 'ready'
      readonly conversation: ConversationIdentity
      readonly messages: readonly UIMessage[]
      /** How a turn reaches the Mac. Given to the chat, which never sees the socket. */
      readonly transport: ChatTransport<UIMessage>
      readonly permissions: readonly ConversationPermission[]
      /** Older turns exist. Absent once the whole transcript has been read. */
      readonly onReadOlder: (() => void) | null
      readonly readingOlder: boolean
      /** A turn was already running when this was read, so the chat re-attaches. */
      readonly resuming: boolean
      readonly actions: ConversationActions
    }

export type ConversationActions = {
  readonly onAnswerPermission: (waiting: ConversationPermission, optionId: string) => void
}

/**
 * One conversation, ready to render.
 *
 * The screen never touches the socket: reading, streaming, and answering the
 * agent's questions are assembled here, so every state can be handed to a
 * story as a value.
 */
export function useConversation(conversationId: ConversationId): ConversationView {
  const relay = useRelay()
  const history = useConversationHistory(conversationId)
  const { waiting, answer } = usePendingPermissions(conversationId)

  const transport = useMemo(
    () => new PorteChatTransport(relay, conversationId),
    [relay, conversationId],
  )

  const actions = useMemo<ConversationActions>(
    () => ({
      onAnswerPermission: (permission, optionId) => {
        void answer(permission.permission, optionId)
      },
    }),
    [answer],
  )

  if (history.status !== 'ready') return history

  return {
    status: 'ready',
    conversation: history.conversation,
    messages: history.messages,
    transport,
    permissions: waiting,
    onReadOlder: history.onReadOlder,
    readingOlder: history.readingOlder,
    resuming: history.resuming,
    actions,
  }
}
