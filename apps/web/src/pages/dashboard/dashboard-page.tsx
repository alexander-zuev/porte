import {
  ConversationList,
  type ConversationListProps,
} from '@web/features/dashboard/components/conversation-list.tsx'
import { PairPrompt } from '@web/features/dashboard/components/pair-prompt.tsx'
import { AppShell } from '@web/ui/components/app-shell.tsx'
import type { ReactNode } from 'react'

/**
 * The dashboard renders one of two shapes.
 *
 * With a Mac it is a conversation list beside a conversation detail. Without one there is
 * nothing to list and nothing to detail, so the pairing prompt takes the page.
 */
export type DashboardPageProps =
  | {
      readonly view: 'conversations'
      readonly detail?: ReactNode
      readonly footer?: ReactNode
      readonly list: ConversationListProps
    }
  | {
      readonly view: 'pair'
      readonly reason: 'unpaired' | 'revoked'
      readonly hostName?: string
      readonly onEnterCode: () => void
    }

export function DashboardPage(props: DashboardPageProps) {
  if (props.view === 'pair') {
    return (
      <div className="dark min-h-svh w-full bg-background text-foreground">
        <PairPrompt
          hostName={props.hostName}
          reason={props.reason}
          onEnterCode={props.onEnterCode}
        />
      </div>
    )
  }

  return (
    <AppShell footer={props.footer} list={<ConversationList {...props.list} />} mobilePane="list">
      {props.detail}
    </AppShell>
  )
}
