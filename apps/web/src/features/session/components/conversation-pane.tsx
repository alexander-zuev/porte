import type { ElicitationAnswer, SessionSummary } from '@porte/core'

import type {
  ElicitationDraftValue,
  SessionControl,
} from '#/entities/session/session-control.ts'
import type { TranscriptItem } from '#/entities/session/transcript.ts'
import { ElicitationDecision } from '#/features/session/components/elicitation-decision.tsx'
import { PermissionDecision } from '#/features/session/components/permission-decision.tsx'
import { SessionComposer } from '#/features/session/components/session-composer.tsx'
import {
  SessionHeader,
  type SessionConnection,
} from '#/features/session/components/session-header.tsx'
import { SessionTranscript } from '#/features/session/components/session-transcript.tsx'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '#/ui/components/ai-elements/conversation.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/ui/components/ui/alert.tsx'

/** User actions available from one ready session pane. */
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

/** Data and actions for one ready session pane. */
export type ConversationPaneProps = {
  readonly session: SessionSummary
  readonly hostName: string
  readonly connection: SessionConnection
  readonly items: readonly TranscriptItem[]
  readonly draft: string
  readonly control: SessionControl
  readonly actions: ConversationActions
}

/** Render one selected session with transcript and turn controls. */
export function ConversationPane(props: ConversationPaneProps) {
  return (
    <>
      <SessionHeader
        connection={props.connection}
        hostName={props.hostName}
        session={props.session}
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
            <SessionTranscript items={props.items} />
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to latest" />
      </Conversation>
      <SessionControls {...props} />
    </>
  )
}

function SessionControls(props: ConversationPaneProps) {
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
    <SessionComposer
      connection={props.connection}
      control={props.control}
      draft={props.draft}
      onDraftChange={props.actions.onDraftChange}
      onSend={props.actions.onSend}
      onStop={props.actions.onStop}
    />
  )
}

function ConnectionNotice({ connection }: { readonly connection: SessionConnection }) {
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
        <AlertDescription>Your draft remains available. Start Porte on the Mac to continue.</AlertDescription>
      </Alert>
    </div>
  )
}
