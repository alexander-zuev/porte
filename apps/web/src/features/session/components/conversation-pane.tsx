import type {
  PermissionRequest,
  TranscriptItem,
  TurnStatus,
} from '#/entities/session/transcript.ts'
import { SessionTranscript } from '#/features/session/components/session-transcript.tsx'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '#/ui/components/ai-elements/conversation.tsx'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '#/ui/components/ai-elements/prompt-input.tsx'
import { HostOfflineAlert, HostStatus } from '#/ui/components/host-status.tsx'
import { Separator } from '#/ui/components/ui/separator.tsx'

export type ConversationPaneProps = {
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

export function ConversationPane({
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
}: ConversationPaneProps) {
  const canSend = online && status === 'idle' && draft.trim().length > 0

  return (
    <>
      <header className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate">{title}</h1>
          <HostStatus status={online ? 'online' : 'offline'} />
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
              <p>No messages yet</p>
              <p className="text-muted-foreground">Send a message to start this turn.</p>
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
          placeholder={online ? 'Message Grok' : 'Host is offline'}
          value={draft}
          onChange={(event) => {
            onDraftChange(event.target.value)
          }}
        />
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit
            disabled={status !== 'streaming' && !canSend}
            status={status === 'streaming' ? 'streaming' : 'ready'}
            onStop={onStop}
          />
        </PromptInputFooter>
      </PromptInput>
    </>
  )
}
