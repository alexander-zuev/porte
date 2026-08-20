import type { ConversationSummary } from '@porte/core'

import {
  ConversationFailure,
  type ConversationFailureProps,
  ConversationOpening,
} from '#/features/conversation/components/conversation-page-feedback.tsx'
import {
  ConversationPane,
  type ConversationPaneProps,
} from '#/features/conversation/components/conversation-pane.tsx'
import { AppShell } from '#/ui/components/app-shell.tsx'

type ConversationContext = {
  readonly conversation: ConversationSummary
  readonly hostName: string
  readonly onBack: () => void
}

/** The mutually exclusive states for one conversation page. */
export type ConversationPageProps =
  | ({ readonly view: 'ready' } & ConversationPaneProps)
  | ({ readonly view: 'opening' } & ConversationContext)
  | ({ readonly view: 'failure' } & ConversationFailureProps)

/** Render one conversation state in the responsive application shell. */
export function ConversationPage(props: ConversationPageProps) {
  if (props.view === 'opening') {
    return (
      <AppShell>
        <ConversationOpening
          hostName={props.hostName}
          conversation={props.conversation}
          onBack={props.onBack}
        />
      </AppShell>
    )
  }
  if (props.view === 'failure') {
    return (
      <AppShell>
        {props.reason === 'host-offline' ? (
          <ConversationFailure
            hostName={props.hostName}
            reason={props.reason}
            conversation={props.conversation}
            onBack={props.onBack}
          />
        ) : (
          <ConversationFailure
            hostName={props.hostName}
            reason={props.reason}
            conversation={props.conversation}
            onBack={props.onBack}
            onRetry={props.onRetry}
          />
        )}
      </AppShell>
    )
  }
  return (
    <AppShell>
      <ConversationPane
        actions={props.actions}
        connection={props.connection}
        control={props.control}
        draft={props.draft}
        hostName={props.hostName}
        items={props.items}
        conversation={props.conversation}
      />
    </AppShell>
  )
}
