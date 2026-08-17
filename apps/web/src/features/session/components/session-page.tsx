import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '#/components/ai-elements/conversation.tsx'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '#/components/ai-elements/prompt-input.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import { AppFrame } from '#/ui/app-frame.tsx'
import { HostOfflineAlert, HostStatus } from '#/ui/host-status.tsx'

import type { PermissionRequest, TranscriptItem, TurnStatus } from '../models/transcript.ts'
import { SessionTranscript } from './session-transcript.tsx'

export type SessionPageProps = {
  readonly title: string
  readonly online: boolean
  readonly status: TurnStatus
  readonly items: readonly TranscriptItem[]
  readonly draft: string
  readonly permission: PermissionRequest | undefined
  readonly onDraftChange: (value: string) => void
  readonly onSend: () => void
  readonly onStop: () => void
  readonly onAnswerPermission: (optionId: string) => void
}

export function SessionPage({
  title,
  online,
  status,
  items,
  draft,
  permission,
  onDraftChange,
  onSend,
  onStop,
  onAnswerPermission,
}: SessionPageProps) {
  const canSend = online && status === 'idle' && draft.trim().length > 0

  return (
    <AppFrame>
      <header className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate text-xl">{title}</h1>
          <HostStatus online={online} />
        </div>
      </header>
      <Separator />
      {online ? null : (
        <div className="px-5 pt-4">
          <HostOfflineAlert />
        </div>
      )}
      <Conversation>
        <ConversationContent>
          {items.length === 0 ? (
            <ConversationEmptyState>
              <p className="text-sm font-medium">No messages yet</p>
              <p className="text-sm text-muted-foreground">Send a message to start this turn.</p>
            </ConversationEmptyState>
          ) : (
            <SessionTranscript
              items={items}
              onAnswerPermission={onAnswerPermission}
              permission={permission}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to latest" />
      </Conversation>
      <PromptInput
        className="p-4"
        onSubmit={() => {
          if (canSend) onSend()
        }}
      >
        <PromptInputTextarea
          disabled={!online || status === 'permission'}
          onChange={(event) => {
            onDraftChange(event.target.value)
          }}
          placeholder={online ? 'Message Grok' : 'Host is offline'}
          value={draft}
        />
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit
            disabled={status !== 'streaming' && !canSend}
            onStop={onStop}
            status={status === 'streaming' ? 'streaming' : 'ready'}
          />
        </PromptInputFooter>
      </PromptInput>
    </AppFrame>
  )
}
