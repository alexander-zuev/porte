import { LightningIcon } from '@phosphor-icons/react'
import type { ConversationLiveState } from '@porte/core/client'
import { ComposerAddMenu } from '@web/features/conversation/components/composer-add-menu.tsx'
import { ComposerConfigurationMenu } from '@web/features/conversation/components/composer-configuration-menu.tsx'
import { ConversationMessages } from '@web/features/conversation/components/conversation-messages.tsx'
import { ConversationPermissions } from '@web/features/conversation/components/conversation-permission.tsx'
import {
  ConversationPlans,
  conversationCost,
} from '@web/features/conversation/components/conversation-progress.tsx'
import type { ConversationPermission } from '@web/features/conversation/hooks/use-answer-permission.ts'
import { Context, ContextContent, ContextTrigger } from '@web/ui/components/ai-elements/context.tsx'
import {
  PromptInput,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import type { ChatStatus, UIMessage } from 'ai'

export type ChatFrameProps = {
  readonly messages: readonly UIMessage[]
  readonly state: ConversationLiveState
  readonly permissions: readonly ConversationPermission[]
  readonly onAnswer?: (waiting: ConversationPermission, optionId: string) => void
  /** The turn stopped on its own. Shown beside the transcript, not instead of it. */
  readonly error?: Error
  readonly status: ChatStatus
  /** Stop was pressed and the Host has not yet finished the turn. */
  readonly stopping?: boolean
  readonly onStop?: () => void
  /** The machine is reachable and the child socket is open. */
  readonly canSend: boolean
  readonly placeholder: string
  readonly onReadOlder?: (() => void) | null
  readonly readingOlder?: boolean
  /** Where a send lands. The real screen has a machine; a story has a line of text. */
  readonly onSend?: (message: PromptInputMessage) => void
}

/**
 * The conversation screen, driven by props instead of a socket.
 *
 * `ConversationChat` reads `useAgentChat`, which needs a live WebSocket and a
 * machine behind it, so no story can put a transcript on the screen through it.
 * This frame renders the same children in the same order, and every state a
 * story shows is one the real screen can reach.
 */
export function ChatFrame({
  messages,
  state,
  permissions,
  onAnswer = () => undefined,
  error,
  status,
  stopping = false,
  onStop = () => undefined,
  canSend,
  placeholder,
  onReadOlder = null,
  readingOlder = false,
  onSend = () => undefined,
}: ChatFrameProps) {
  const running = status === 'streaming' || status === 'submitted'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ConversationMessages
        error={error}
        messages={messages}
        pending={status === 'submitted'}
        readingOlder={readingOlder}
        onReadOlder={onReadOlder}
      />

      <ConversationPlans plans={state.plans} running={running} />

      <ConversationPermissions onAnswer={onAnswer} waiting={permissions} />

      <PromptInput
        className="mb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={(message) => {
          if (message.text.trim() === '' && message.files.length === 0) return
          onSend(message)
        }}
      >
        <PromptInputBody>
          <PromptInputAttachments />
          <PromptInputTextarea disabled={!canSend} placeholder={placeholder} />
          <PromptInputFooter>
            <PromptInputTools>
              <ComposerAddMenu disabled={!canSend || running} />
              {state.modeId === undefined ? null : (
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-muted-foreground">
                  <LightningIcon aria-hidden className="size-4" />
                  {state.modeId}
                </span>
              )}
            </PromptInputTools>
            <div className="ml-auto flex items-center gap-1">
              <ComposerConfigurationMenu
                actions={{ onSetModel: () => undefined }}
                disabled={!canSend}
                options={state.configuration ?? []}
                pending={false}
              />
              {state.usage === undefined ? null : (
                <Context maxTokens={state.usage.sizeTokens} usedTokens={state.usage.usedTokens}>
                  <ContextTrigger aria-label="Show context usage" />
                  <ContextContent>
                    {conversationCost(state.usage) === undefined ? null : (
                      <small className="text-muted-foreground">
                        Cost {conversationCost(state.usage)}
                      </small>
                    )}
                  </ContextContent>
                </Context>
              )}
              <PromptInputSubmit disabled={!canSend || stopping} status={status} onStop={onStop} />
            </div>
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>
    </div>
  )
}
