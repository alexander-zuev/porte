import {
  ConversationPane,
  type ConversationPaneProps,
} from '#/features/session/components/conversation-pane.tsx'
import { AppShell } from '#/ui/components/app-shell.tsx'

export type ConversationPageProps = ConversationPaneProps

export function ConversationPage(props: ConversationPageProps) {
  return (
    <AppShell>
      <ConversationPane {...props} />
    </AppShell>
  )
}
