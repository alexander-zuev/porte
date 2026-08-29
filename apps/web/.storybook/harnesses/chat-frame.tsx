import type { ConversationLiveState } from '@porte/core/client'
import { ComposerAddMenu } from '@web/features/conversation/components/composer-add-menu.tsx'
import { ConversationMessages } from '@web/features/conversation/components/conversation-messages.tsx'
import { ConversationPermissions } from '@web/features/conversation/components/conversation-permission.tsx'
import {
  ConversationChanges,
  ConversationPlans,
  conversationCost,
} from '@web/features/conversation/components/conversation-progress.tsx'
import type { ConversationPermission } from '@web/features/conversation/hooks/use-answer-permission.ts'
import type { ConversationCommands } from '@web/features/conversation/hooks/use-conversation-commands.ts'
import { lastTurnChanges } from '@web/features/conversation/models/tool-runs.ts'
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
  /** The Host's command list, as the `+` menu reads it. */
  readonly commands: ConversationCommands
  readonly permissions: readonly ConversationPermission[]
  readonly onAnswer?: (waiting: ConversationPermission, optionId: string) => void
  /** The turn stopped on its own. Shown beside the transcript, not instead of it. */
  readonly error?: Error
  readonly status: ChatStatus
  /** Stop was pressed and the Host has not yet finished the turn. */
  readonly stopping?: boolean
  readonly onStop?: () => void
  /** The Mac is reachable and the child socket is open. */
  readonly canSend: boolean
  readonly placeholder: string
  readonly onReadOlder?: (() => void) | null
  readonly readingOlder?: boolean
  /** Where a send lands. The real screen has a Mac; a story has a line of text. */
  readonly onSend?: (message: PromptInputMessage) => void
  readonly onCommand?: (name: string) => void
}

/**
 * The conversation screen, driven by props instead of a socket.
 *
 * `ConversationChat` reads `useAgentChat`, which needs a live WebSocket and a
 * Mac behind it, so no story can put a transcript on the screen through it.
 * This frame renders the same children in the same order, and every state a
 * story shows is one the real screen can reach.
 */
export function ChatFrame({
  messages,
  state,
  commands,
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
  onCommand = () => undefined,
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

      <ConversationChanges changes={lastTurnChanges(messages)} />

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
              <ComposerAddMenu
                commands={commands}
                disabled={!canSend || running}
                onCommand={onCommand}
                onOpenChange={() => undefined}
              />
              {state.configuration?.map((option) => (
                <small key={option.id} className="hidden text-muted-foreground md:inline">
                  {option.name}: {configurationValue(option)}
                </small>
              ))}
              {state.modeId === undefined ? null : (
                <small className="hidden text-muted-foreground md:inline">
                  Mode: {state.modeId}
                </small>
              )}
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
            </PromptInputTools>
            <PromptInputSubmit
              className="ml-auto"
              disabled={!canSend || stopping}
              status={status}
              onStop={onStop}
            />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>
    </div>
  )
}

function configurationValue(
  option: NonNullable<ConversationLiveState['configuration']>[number],
): string {
  if (option.type === 'boolean') return option.currentValue ? 'On' : 'Off'
  const values = option.options.flatMap((value) =>
    value.type === 'group' ? value.options : [value],
  )
  return values.find((value) => value.value === option.currentValue)?.name ?? option.currentValue
}
