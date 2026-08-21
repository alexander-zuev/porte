import { useChat } from '@ai-sdk/react'
import type { ConversationId } from '@porte/core/client'
import type { ConversationActions } from '@web/entities/conversation/use-conversation.ts'
import type { ConversationPermission } from '@web/entities/conversation/use-pending-permissions.ts'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import type { ChatTransport, UIMessage } from 'ai'

import { ConversationMessages } from './conversation-messages.tsx'
import { ConversationPermissions } from './conversation-permission.tsx'
import { ConversationTurnFailed } from './conversation-states.tsx'

export type ConversationChatProps = {
  readonly conversationId: ConversationId
  /** The stored transcript. Read before this mounts, so the chat opens with it. */
  readonly history: readonly UIMessage[]
  /** How a turn reaches the Mac. Given rather than built, so a story can pass its own. */
  readonly transport: ChatTransport<UIMessage>
  readonly permissions: readonly ConversationPermission[]
  readonly actions: ConversationActions
  readonly canSend: boolean
  /** Older turns exist. Absent once the whole transcript has been read. */
  readonly onReadOlder: (() => void) | null
  readonly readingOlder: boolean
  /** A turn was already running when this was read, so the chat re-attaches. */
  readonly resuming: boolean
}

/**
 * One conversation's messages and its composer.
 *
 * Mounted only once history has been read, so the chat opens with the
 * transcript instead of being seeded into it afterwards. Everything about a
 * running turn — status, streaming, stopping — belongs to `useChat`.
 */
export function ConversationChat({
  conversationId,
  history,
  transport,
  permissions,
  actions,
  canSend,
  onReadOlder,
  readingOlder,
  resuming,
}: ConversationChatProps) {
  // Resume only when a turn really is running. Re-attaching opens the
  // conversation on the Mac, and opening starts an agent.
  const chat = useChat({ id: conversationId, messages: [...history], transport, resume: resuming })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ConversationMessages
        messages={chat.messages}
        readingOlder={readingOlder}
        onReadOlder={onReadOlder}
      />

      {chat.error === undefined ? null : <ConversationTurnFailed error={chat.error} />}

      <ConversationPermissions onAnswer={actions.onAnswerPermission} waiting={permissions} />

      <PromptInput
        className="mb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={(message) => {
          if (message.text.trim() === '') return
          void chat.sendMessage({ text: message.text })
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            disabled={!canSend}
            placeholder={canSend ? 'Ask your Mac…' : 'Your Mac is offline'}
          />
          <PromptInputFooter>
            <PromptInputSubmit
              className="ml-auto"
              disabled={!canSend}
              status={chat.status}
              onStop={() => {
                void chat.stop()
              }}
            />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>
    </div>
  )
}
