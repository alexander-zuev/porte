import { useAgentChat } from '@cloudflare/ai-chat/react'
import type { ConversationRelayState } from '@porte/core/client'
import type {
  ConversationActions,
  ConversationAgentConnection,
  ConversationPermission,
} from '@web/entities/conversation/use-conversation.ts'
import { Context, ContextContent, ContextTrigger } from '@web/ui/components/ai-elements/context.tsx'
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuItem,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@web/ui/components/ai-elements/prompt-input.tsx'

import { ConversationMessages } from './conversation-messages.tsx'
import { ConversationPermissions } from './conversation-permission.tsx'
import { ConversationPlans, conversationCost } from './conversation-progress.tsx'
import { ConversationTurnFailed } from './conversation-states.tsx'

export type ConversationChatProps = {
  readonly agent: ConversationAgentConnection
  readonly permissions: readonly ConversationPermission[]
  readonly state: ConversationRelayState
  readonly actions: ConversationActions
  readonly canSend: boolean
}

/** Renders one conversation from its AIChatAgent connection. */
export function ConversationChat({
  agent,
  permissions,
  state,
  actions,
  canSend,
}: ConversationChatProps) {
  const chat = useAgentChat({ agent })
  const childReady = agent.readyState === agent.OPEN
  const canSubmit = canSend && childReady

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ConversationMessages messages={chat.messages} readingOlder={false} onReadOlder={null} />

      <ConversationPlans plans={state.plans} running={chat.isServerStreaming} />

      {chat.error === undefined ? null : <ConversationTurnFailed error={chat.error} />}

      <ConversationPermissions onAnswer={actions.onAnswerPermission} waiting={permissions} />

      <PromptInput
        className="mb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={(message) => {
          if (!canSubmit) return
          if (message.text.trim() === '' && message.files.length === 0) return
          void chat.sendMessage({ text: message.text, files: message.files })
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            disabled={!canSubmit}
            placeholder={promptPlaceholder(canSend, childReady)}
          />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger aria-label="Add attachment" disabled={!canSubmit} />
                {/* Grok lists hundreds of commands; names only, in a list that scrolls, not a column that wraps. */}
                <PromptInputActionMenuContent className="max-h-[60svh] min-w-56 overflow-y-auto sm:min-w-72">
                  <PromptInputActionAddAttachments />
                  {state.commands?.map((command) => (
                    <PromptInputActionMenuItem
                      key={command.name}
                      className="font-mono"
                      disabled={!canSubmit}
                      onClick={() => {
                        void chat.sendMessage({ text: `/${command.name}` })
                      }}
                    >
                      /{command.name}
                    </PromptInputActionMenuItem>
                  ))}
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
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
              disabled={!canSubmit}
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

function configurationValue(
  option: NonNullable<ConversationRelayState['configuration']>[number],
): string {
  if (option.type === 'boolean') return option.currentValue ? 'On' : 'Off'
  const values = option.options.flatMap((value) =>
    value.type === 'group' ? value.options : [value],
  )
  return values.find((value) => value.value === option.currentValue)?.name ?? option.currentValue
}

function promptPlaceholder(canSend: boolean, childReady: boolean): string {
  if (!canSend) return 'Your Mac is offline'
  if (!childReady) return 'Reconnecting…'
  return 'Ask your Mac…'
}
