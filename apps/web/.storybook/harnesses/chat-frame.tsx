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
  usePromptInputController,
  type PromptInputMessage,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import type { ChatStatus, UIMessage } from 'ai'
import type { ReactNode } from 'react'

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
  /** While a turn runs, Enter queues instead of sending. Absent: the composer sends. */
  readonly onQueue?: (message: PromptInputMessage) => void
  /** The queue pill, drawn above the composer. */
  readonly queue?: ReactNode
  /** The changes pill, drawn above the composer. */
  readonly changes?: ReactNode
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
  onQueue,
  queue,
  changes,
}: ChatFrameProps) {
  const running = status === 'streaming' || status === 'submitted'
  const queues = running && onQueue !== undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ConversationMessages
        error={error}
        messages={messages}
        running={running}
        readingOlder={readingOlder}
        onReadOlder={onReadOlder}
      />

      <ConversationPlans plans={state.plans} running={running} />

      <ConversationPermissions onAnswer={onAnswer} waiting={permissions} />

      <div className="flex justify-end gap-2 empty:hidden">
        {changes}
        {queue}
      </div>

      <PromptInput
        className="mb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={(message) => {
          if (message.text.trim() === '' && message.files.length === 0) return
          if (queues) onQueue(message)
          else onSend(message)
        }}
      >
        <PromptInputBody>
          <PromptInputAttachments />
          <PromptInputTextarea disabled={!canSend} placeholder={placeholder} />
          <PromptInputFooter>
            <PromptInputTools>
              <ComposerAddMenu disabled={!canSend || running} />
              {state.modeId === undefined ? null : (
                <span className="hidden h-8 items-center gap-1.5 rounded-full border px-3 text-muted-foreground md:inline-flex">
                  <LightningIcon aria-hidden className="size-4" />
                  {state.modeId}
                </span>
              )}
            </PromptInputTools>
            <ComposerConfigurationMenu
              actions={{ onSetModel: () => undefined }}
              className="md:ml-auto"
              disabled={!canSend}
              options={state.configuration ?? []}
              pending={false}
            />
            <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
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
              {queues ? (
                <QueueOrStop disabled={!canSend || stopping} onStop={onStop} />
              ) : (
                <PromptInputSubmit
                  disabled={!canSend || stopping}
                  status={status}
                  onStop={onStop}
                />
              )}
            </div>
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>
    </div>
  )
}

/** One button while a turn runs, as Grok draws it: Stop when empty, the send arrow (which queues) once there is text. */
function QueueOrStop({
  disabled,
  onStop,
}: {
  readonly disabled: boolean
  readonly onStop: () => void
}) {
  const controller = usePromptInputController()
  const empty =
    controller.textInput.value.trim() === '' && controller.attachments.files.length === 0
  return (
    <PromptInputSubmit disabled={disabled} status={empty ? 'streaming' : 'ready'} onStop={onStop} />
  )
}
