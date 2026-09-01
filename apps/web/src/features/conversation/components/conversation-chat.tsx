import { useAgentChat } from '@cloudflare/ai-chat/react'
import { LightningIcon } from '@phosphor-icons/react'
import type { ConversationLiveState } from '@porte/core/client'
import type {
  ConversationActions,
  ConversationPermission,
} from '@web/features/conversation/hooks/use-answer-permission.ts'
import { useComposerVoice } from '@web/features/conversation/hooks/use-composer-voice.ts'
import type { ConversationAgentConnection } from '@web/features/conversation/hooks/use-conversation-agent.ts'
import { useSetModel } from '@web/features/conversation/hooks/use-set-model.ts'
import { useStopTurn } from '@web/features/conversation/hooks/use-stop-turn.ts'
import { Context, ContextContent, ContextTrigger } from '@web/ui/components/ai-elements/context.tsx'
import {
  PromptInput,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import type { ChatStatus, UIMessage } from 'ai'

import { ComposerAddMenu } from './composer-add-menu.tsx'
import { ComposerCommandSuggestions } from './composer-command-suggestions.tsx'
import { ComposerConfigurationMenu } from './composer-configuration-menu.tsx'
import { ComposerMicButton, ComposerVoiceBar } from './composer-voice.tsx'
import { ConversationMessages } from './conversation-messages.tsx'
import { ConversationPermissions } from './conversation-permission.tsx'
import { ConversationPlans, conversationCost } from './conversation-progress.tsx'

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
  const canType = canSend && agent.identified
  const canSubmit = canType && !running
  const status = submitStatus(chat.status, running)
  const setModel = useSetModel(agent.stub)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ConversationMessages
        error={chat.error}
        messages={chat.messages}
        pending={chat.status === 'submitted'}
        readingOlder={false}
        onReadOlder={null}
      />

      <ConversationPlans plans={state.plans} running={running} />

      <ConversationPermissions onAnswer={actions.onAnswerPermission} waiting={permissions} />

      {/* The provider carries the typed text, so the `/` suggestions can watch it. */}
      <PromptInputProvider>
        <div className="relative mb-2">
          <ComposerCommandSuggestions agent={agent} />
          <PromptInput
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
              <ChatComposerFooter
                canSubmit={canSubmit}
                canType={canType}
                setModel={setModel}
                state={state}
                status={status}
                stop={stop}
              />
            </PromptInputBody>
          </PromptInput>
        </div>
      </PromptInputProvider>
    </div>
  )
}

/**
 * The composer's bottom row. While a voice recording is open or transcribing,
 * the whole row is the voice bar; otherwise the tools and the send cluster.
 */
function ChatComposerFooter({
  canSubmit,
  canType,
  setModel,
  state,
  status,
  stop,
}: {
  readonly canSubmit: boolean
  readonly canType: boolean
  readonly setModel: ReturnType<typeof useSetModel>
  readonly state: ConversationLiveState
  readonly status: ChatStatus
  readonly stop: ReturnType<typeof useStopTurn>
}) {
  const voice = useComposerVoice()

  return (
    <PromptInputFooter>
      {voice.status !== 'idle' ? (
        <ComposerVoiceBar voice={voice} />
      ) : (
        <>
          <PromptInputTools>
            <ComposerAddMenu disabled={!canSubmit} />
            {/* Hidden on a phone: the row has room for the model pill or the mode, not both. */}
            {state.modeId === undefined ? null : (
              <span className="hidden h-8 items-center gap-1.5 rounded-full border px-3 text-muted-foreground md:inline-flex">
                <LightningIcon aria-hidden className="size-4" />
                {state.modeId}
              </span>
            )}
          </PromptInputTools>
          {/* Beside the add button on a phone, as the Claude app lays it out; right of the gap from md up. */}
          <ComposerConfigurationMenu
            actions={{ onSetModel: setModel.onSetModel }}
            className="md:ml-auto"
            disabled={!canType}
            options={state.configuration ?? []}
            pending={setModel.pending}
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
            <ComposerMicButton disabled={!canType} start={voice.start} />
            {/* Stopping keeps the Stop icon and goes inert until the Host finishes the turn. */}
            <ComposerSubmit
              disabled={!canType || stop.stopping}
              status={status}
              onStop={stop.onStop}
            />
          </div>
        </>
      )}
    </PromptInputFooter>
  )
}

/** Send goes inert with nothing to send; Stop stays live while a turn runs. */
function ComposerSubmit({
  disabled,
  status,
  onStop,
}: {
  readonly disabled: boolean
  readonly status: ChatStatus
  readonly onStop: () => void
}) {
  const controller = usePromptInputController()
  const empty =
    controller.textInput.value.trim() === '' && controller.attachments.files.length === 0
  const sendBlocked = empty && status === 'ready'
  return <PromptInputSubmit disabled={disabled || sendBlocked} status={status} onStop={onStop} />
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
