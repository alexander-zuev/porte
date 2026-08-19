import type { SessionSummary } from '@porte/core'

import {
  ConversationPane,
  type ConversationPaneProps,
} from '#/features/session/components/conversation-pane.tsx'
import {
  SessionFailure,
  type SessionFailureProps,
  SessionOpening,
} from '#/features/session/components/session-page-feedback.tsx'
import { AppShell } from '#/ui/components/app-shell.tsx'

type SessionContext = {
  readonly session: SessionSummary
  readonly hostName: string
  readonly onBack: () => void
}

/** The mutually exclusive states for one session page. */
export type ConversationPageProps =
  | ({ readonly view: 'ready' } & ConversationPaneProps)
  | ({ readonly view: 'opening' } & SessionContext)
  | ({ readonly view: 'failure' } & SessionFailureProps)

/** Render one session state in the responsive application shell. */
export function ConversationPage(props: ConversationPageProps) {
  if (props.view === 'opening') {
    return (
      <AppShell>
        <SessionOpening
          hostName={props.hostName}
          session={props.session}
          onBack={props.onBack}
        />
      </AppShell>
    )
  }
  if (props.view === 'failure') {
    return (
      <AppShell>
        {props.reason === 'host-offline' ? (
          <SessionFailure
            hostName={props.hostName}
            reason={props.reason}
            session={props.session}
            onBack={props.onBack}
          />
        ) : (
          <SessionFailure
            hostName={props.hostName}
            reason={props.reason}
            session={props.session}
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
        session={props.session}
      />
    </AppShell>
  )
}
