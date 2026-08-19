import type { ReactNode } from 'react'

import {
  SessionList,
  type SessionListProps,
} from '#/features/dashboard/components/session-list.tsx'
import { AppShell } from '#/ui/components/app-shell.tsx'

export type DashboardPageProps = SessionListProps & { readonly detail?: ReactNode }

export function DashboardPage({ detail, ...props }: DashboardPageProps) {
  return (
    <AppShell list={<SessionList {...props} />} mobilePane="list">
      {detail}
    </AppShell>
  )
}
