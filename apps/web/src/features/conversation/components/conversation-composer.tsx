import { ArrowElbowDownLeftIcon, SquareIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { ConversationControl } from '@web/entities/conversation/conversation-control.ts'
import type { ConversationConnection } from '@web/features/conversation/components/conversation-header.tsx'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

type ComposerControl = Exclude<ConversationControl, { state: 'permission' | 'elicitation' }>

/** Render the prompt draft and turn actions for a conversation without a pending decision. */
export function ConversationComposer({
  connection,
  control,
  draft,
  onDraftChange,
  onSend,
  onStop,
}: {
  readonly connection: ConversationConnection
  readonly control: ComposerControl
  readonly draft: string
  readonly onDraftChange: (value: string) => void
  readonly onSend: () => void
  readonly onStop: () => void
}) {
  const canStart =
    connection === 'online' &&
    (control.state === 'idle' ||
      control.state === 'cancelled' ||
      control.state === 'completed' ||
      control.state === 'failed') &&
    draft.trim().length > 0
  const locked = control.state === 'sending' || control.state === 'stopping'

  return (
    <div className="flex flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <TurnFeedback control={control} />
      <PromptInput
        onSubmit={() => {
          if (canStart) onSend()
        }}
      >
        <PromptInputTextarea
          disabled={locked}
          placeholder={composerPlaceholder(connection)}
          value={draft}
          onChange={(event) => {
            onDraftChange(event.target.value)
          }}
        />
        <PromptInputFooter className="justify-end">
          <ComposerAction canStart={canStart} control={control} onStop={onStop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}

function ComposerAction({
  control,
  canStart,
  onStop,
}: {
  readonly control: ComposerControl
  readonly canStart: boolean
  readonly onStop: () => void
}) {
  if (control.state === 'running') {
    return (
      <PromptInputSubmit className="min-h-11 px-3" size="sm" status="streaming" onStop={onStop}>
        <SquareIcon data-icon="inline-start" />
        Stop
      </PromptInputSubmit>
    )
  }
  if (control.state === 'stopping') {
    return (
      <PromptInputSubmit disabled className="min-h-11 px-3" size="sm" status="streaming">
        <Spinner data-icon="inline-start" />
        Stop
      </PromptInputSubmit>
    )
  }
  if (control.state === 'sending') {
    return (
      <PromptInputSubmit disabled className="min-h-11 px-3" size="sm" status="submitted">
        <Spinner data-icon="inline-start" />
        Send
      </PromptInputSubmit>
    )
  }
  return (
    <PromptInputSubmit disabled={!canStart} className="min-h-11 px-3" size="sm">
      <ArrowElbowDownLeftIcon data-icon="inline-start" />
      Send
    </PromptInputSubmit>
  )
}

function TurnFeedback({ control }: { readonly control: ComposerControl }) {
  if (control.state === 'delivery-unknown') {
    return (
      <Alert>
        <WarningCircleIcon />
        <AlertTitle>Delivery status is unknown</AlertTitle>
        <AlertDescription>Porte will check the turn state after reconnection.</AlertDescription>
      </Alert>
    )
  }
  if (control.state === 'failed') {
    return (
      <Alert variant="destructive">
        <WarningCircleIcon />
        <AlertTitle>Turn failed</AlertTitle>
        <AlertDescription>{control.error.message}</AlertDescription>
      </Alert>
    )
  }
  if (control.state === 'cancelled') return <output>Turn cancelled</output>
  if (control.state === 'completed') return <output>Turn completed</output>
  return null
}

function composerPlaceholder(connection: ConversationConnection): string {
  if (connection === 'offline') return 'Mac is offline'
  if (connection === 'reconnecting') return 'Reconnecting'
  return 'Message Grok'
}
