import { useAgentChat } from '@cloudflare/ai-chat/react'
import type { ConversationLiveState } from '@porte/core/client'
import type {
  ConversationActions,
  ConversationPermission,
} from '@web/features/conversation/hooks/use-answer-permission.ts'
import type { ConversationAgentConnection } from '@web/features/conversation/hooks/use-conversation-agent.ts'
import { useConversationCommands } from '@web/features/conversation/hooks/use-conversation-commands.ts'
import { useStopTurn } from '@web/features/conversation/hooks/use-stop-turn.ts'
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
import { useState } from 'react'

import { lastTurnChanges } from '../models/tool-runs.ts'
import { ComposerAddMenu } from './composer-add-menu.tsx'
import { ConversationMessages } from './conversation-messages.tsx'
import { ConversationPermissions } from './conversation-permission.tsx'
import {
  ConversationChanges,
  ConversationPlans,
  conversationCost,
} from './conversation-progress.tsx'

export type ConversationChatProps = {
  readonly agent: ConversationAgentConnection
  readonly messages: UIMessage[]
  readonly permissions: readonly ConversationPermission[]
  readonly state: ConversationLiveState
  readonly actions: ConversationActions
  readonly canSend: boolean
}

/** Renders one conversation from its AIChatAgent connection. */
export function ConversationChat({
  agent,
  messages,
  permissions,
  state,
  actions,
  canSend,
}: ConversationChatProps) {
  // `null` turns off the SDK's own fetch: the route loader already read the transcript.
  const chat = useAgentChat({ agent, getInitialMessages: null, messages })
  // The Host owns "a turn runs"; the SDK's stream status only adds the local `submitted` spinner.
  const running = state.runningTurnId !== undefined
  const stop = useStopTurn(agent.stub, state.runningTurnId)
  const [menuOpen, setMenuOpen] = useState(false)
  const commands = useConversationCommands(agent, menuOpen)
  const canType = canSend && agent.identified
  const canSubmit = canType && !running
  const status = submitStatus(chat.status, running)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ConversationMessages
        error={chat.error}
        messages={chat.messages}
        pending={chat.status === 'submitted'}
        readingOlder={false}
        onReadOlder={null}
      />

      <ConversationChanges changes={lastTurnChanges(chat.messages)} />

      <ConversationPlans plans={state.plans} running={running} />

      <ConversationPermissions onAnswer={actions.onAnswerPermission} waiting={permissions} />

      <PromptInput
        className="mb-2"
        onSubmit={(message) => {
          if (!canSubmit) return
          if (message.text.trim() === '' && message.files.length === 0) return
          void chat.sendMessage({ text: message.text, files: message.files })
        }}
      >
        <PromptInputBody>
          <PromptInputAttachments />
          <PromptInputTextarea
            disabled={!canType}
            placeholder={promptPlaceholder(canSend, agent.identified)}
          />
          <PromptInputFooter>
            <PromptInputTools>
              <ComposerAddMenu
                commands={commands}
                disabled={!canSubmit}
                onCommand={(name) => {
                  void chat.sendMessage({ text: `/${name}` })
                }}
                onOpenChange={setMenuOpen}
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
            {/* Stopping keeps the Stop icon and goes inert until the Host finishes the turn. */}
            <PromptInputSubmit
              className="ml-auto"
              disabled={!canType || stop.stopping}
              status={status}
              onStop={stop.onStop}
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

/**
 * What the submit control shows. `submitted` is the SDK's "sent, no
 * `turn.started` yet"; from then on the Host's running turn is the fact.
 * A reload mid-turn shows Stop even though the SDK holds no stream.
 */
function submitStatus(chatStatus: ChatStatus, running: boolean): ChatStatus {
  if (chatStatus === 'submitted') return 'submitted'
  if (running) return 'streaming'
  return 'ready'
}

function promptPlaceholder(canSend: boolean, identified: boolean): string {
  if (!canSend) return 'Your machine is offline'
  if (!identified) return 'Reconnecting…'
  // The agent is addressed, not the machine it runs on.
  return 'Message Grok…'
}
