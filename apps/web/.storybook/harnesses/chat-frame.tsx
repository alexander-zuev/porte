import type { ConversationRelayState } from '@porte/core/client'
import { ComposerAddMenu } from '@web/features/conversation/components/composer-add-menu.tsx'
import { ConversationMessages } from '@web/features/conversation/components/conversation-messages.tsx'
import { ConversationPermissions } from '@web/features/conversation/components/conversation-permission.tsx'
import {
  ConversationPlans,
  conversationCost,
} from '@web/features/conversation/components/conversation-progress.tsx'
import { ConversationTurnFailed } from '@web/features/conversation/components/conversation-states.tsx'
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
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import type { ChatStatus, UIMessage } from 'ai'

export type ChatFrameProps = {
  readonly messages: readonly UIMessage[]
  readonly state: ConversationRelayState
  readonly permissions: readonly ConversationPermission[]
  /** The turn stopped on its own. Shown beside the transcript, not instead of it. */
  readonly error?: Error
  readonly status: ChatStatus
  /** The Mac is reachable and the child socket is open. */
  readonly canSend: boolean
  readonly placeholder: string
  readonly onReadOlder?: (() => void) | null
  readonly readingOlder?: boolean
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
  permissions,
  error,
  status,
  canSend,
  placeholder,
  onReadOlder = null,
  readingOlder = false,
}: ChatFrameProps) {
  const running = status === 'streaming' || status === 'submitted'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ConversationMessages
        messages={messages}
        readingOlder={readingOlder}
        onReadOlder={onReadOlder}
      />

      <ConversationPlans plans={state.plans} running={running} />

      {error === undefined ? null : <ConversationTurnFailed error={error} />}

      <ConversationPermissions onAnswer={() => undefined} waiting={permissions} />

      <PromptInput
        className="mb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={() => {
          // Nothing to send into: the story has no Mac behind it.
        }}
      >
        <PromptInputBody>
          <PromptInputAttachments />
          <PromptInputTextarea disabled={!canSend} placeholder={placeholder} />
          <PromptInputFooter>
            <PromptInputTools>
              <ComposerAddMenu
                commands={state.commands}
                disabled={!canSend}
                onCommand={() => undefined}
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
              disabled={!canSend}
              status={status}
              onStop={() => undefined}
            />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>
    </div>
  )
}

function configurationValue(
  option: NonNullable<ConversationRelayState['configuration']>[number],
): string {
  if (option.type === 'boolean') return option.currentValue ? 'On' : 'Off'
  const values = option.options.flatMap((value) =>
    value.type === 'group' ? value.options : [value],
  )
  return values.find((value) => value.value === option.currentValue)?.name ?? option.currentValue
}
