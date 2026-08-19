import { createFileRoute } from '@tanstack/react-router'

import { DashboardPage } from '#/pages/dashboard/dashboard-page.tsx'

export const Route = createFileRoute('/_auth/dashboard')({
  component: DashboardRoute,
})

function DashboardRoute() {
  return (
    <DashboardPage
      hostName="Porte host"
      state="loading"
      onOpenSession={() => undefined}
      onPair={() => undefined}
      onRetry={() => undefined}
      onStartSession={() => undefined}
    />
  )
}
