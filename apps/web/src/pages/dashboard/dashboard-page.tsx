import {
  SessionList,
  type SessionListProps,
} from '#/features/dashboard/components/session-list.tsx'
import { AppShell } from '#/ui/components/app-shell.tsx'

export type DashboardPageProps = SessionListProps

export function DashboardPage(props: DashboardPageProps) {
  return <AppShell list={<SessionList {...props} />} />
}
