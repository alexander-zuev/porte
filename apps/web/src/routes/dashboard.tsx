import { createFileRoute } from '@tanstack/react-router'

import { DashboardPage } from '#/pages/dashboard/dashboard-page.tsx'

export const Route = createFileRoute('/dashboard')({
  component: DashboardRoute,
})

function DashboardRoute() {
  return (
    <DashboardPage
      online={false}
      sessions={[]}
      onOpenSession={() => undefined}
      onStartSession={() => undefined}
    />
  )
}
