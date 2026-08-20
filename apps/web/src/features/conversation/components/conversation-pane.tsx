import type { ElicitationAnswer, ConversationSummary } from '@porte/core'

import type {
  ElicitationDraftValue,
  ConversationControl,
} from '#/entities/conversation/conversation-control.ts'
import type { TranscriptItem } from '#/entities/conversation/transcript.ts'
import { ConversationComposer } from '#/features/conversation/components/conversation-composer.tsx'
import {
  ConversationHeader,
  type ConversationConnection,
} from '#/features/conversation/components/conversation-header.tsx'
import { ConversationTranscript } from '#/features/conversation/components/conversation-transcript.tsx'
import { ElicitationDecision } from '#/features/conversation/components/elicitation-decision.tsx'
import { PermissionDecision } from '#/features/conversation/components/permission-decision.tsx'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '#/ui/components/ai-elements/conversation.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/ui/components/ui/alert.tsx'

/** User actions available from one ready conversation pane. */
export type ConversationActions = {
  readonly onBack: () => void
  readonly onDraftChange: (value: string) => void
  readonly onSend: () => void
  readonly onStop: () => void
  readonly onAnswerPermission: (optionId: string) => void
  readonly onRetryPermission: () => void
  readonly onAnswerElicitation: (answer: ElicitationAnswer) => void
  readonly onOpenElicitationUrl: (url: string) => void
  readonly onSubmitElicitation: () => void
  readonly onElicitationValueChange: (fieldId: string, value: ElicitationDraftValue) => void
}

/** Data and actions for one ready conversation pane. */
export type ConversationPaneProps = {
  readonly conversation: ConversationSummary
  readonly hostName: string
  readonly connection: ConversationConnection
  readonly items: readonly TranscriptItem[]
  readonly draft: string
  readonly control: ConversationControl
  readonly actions: ConversationActions
}

/** Render one selected conversation with transcript and turn controls. */
export function ConversationPane(props: ConversationPaneProps) {
  return (
    <>
      <ConversationHeader
        connection={props.connection}
        hostName={props.hostName}
        conversation={props.conversation}
        onBack={props.actions.onBack}
      />
      <ConnectionNotice connection={props.connection} />
      <Conversation>
        <ConversationContent>
          {props.items.length === 0 ? (
            <ConversationEmptyState>
              <p>No messages yet</p>
              <p className="text-muted-foreground">Send a message to start the first turn.</p>
            </ConversationEmptyState>
          ) : (
            <ConversationTranscript items={props.items} />
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to latest" />
      </Conversation>
      <ConversationControls {...props} />
    </>
  )
}

function ConversationControls(props: ConversationPaneProps) {
  if (props.control.state === 'permission') {
    return (
      <PermissionDecision
        connection={props.connection}
        decision={props.control.decision}
        onAnswer={props.actions.onAnswerPermission}
        onRetry={props.actions.onRetryPermission}
        onStop={props.actions.onStop}
      />
    )
  }
  if (props.control.state === 'elicitation') {
    return (
      <ElicitationDecision
        actions={{
          onAnswer: props.actions.onAnswerElicitation,
          onOpenUrl: props.actions.onOpenElicitationUrl,
          onSubmit: props.actions.onSubmitElicitation,
          onStop: props.actions.onStop,
          onValueChange: props.actions.onElicitationValueChange,
        }}
        connection={props.connection}
        decision={props.control.decision}
      />
    )
  }
  return (
    <ConversationComposer
      connection={props.connection}
      control={props.control}
      draft={props.draft}
      onDraftChange={props.actions.onDraftChange}
      onSend={props.actions.onSend}
      onStop={props.actions.onStop}
    />
  )
}

function ConnectionNotice({ connection }: { readonly connection: ConversationConnection }) {
  if (connection === 'online') return null
  if (connection === 'reconnecting') {
    return (
      <div className="px-5 pt-4">
        <Alert>
          <AlertTitle>Reconnecting</AlertTitle>
          <AlertDescription>Your transcript and draft remain available.</AlertDescription>
        </Alert>
      </div>
    )
  }
  return (
    <div className="px-5 pt-4">
      <Alert>
        <AlertTitle>Mac is offline</AlertTitle>
        <AlertDescription>
          Your draft remains available. Start Porte on the Mac to continue.
        </AlertDescription>
      </Alert>
    </div>
  )
}
