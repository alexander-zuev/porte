import type { ReactNode } from 'react'

import { PairPrompt } from '#/features/dashboard/components/pair-prompt.tsx'
import {
  SessionList,
  type SessionListProps,
} from '#/features/dashboard/components/session-list.tsx'
import { AppShell } from '#/ui/components/app-shell.tsx'

/**
 * The dashboard renders one of two shapes.
 *
 * With a Mac it is a session list beside a session detail. Without one there is
 * nothing to list and nothing to detail, so the pairing prompt takes the page.
 */
export type DashboardPageProps =
  | {
      readonly view: 'sessions'
      readonly detail?: ReactNode
      readonly footer?: ReactNode
      readonly list: SessionListProps
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
    <AppShell footer={props.footer} list={<SessionList {...props.list} />} mobilePane="list">
      {props.detail}
    </AppShell>
  )
}
