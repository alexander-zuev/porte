import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { AccountFlow } from '@web/features/account/components/account-flow.tsx'

export const Route = createFileRoute('/_auth/account')({
  loader: ({ context }) => context.queryClient.ensureQueryData(hostQueries.view()),
  component: AccountRoute,
})

function AccountRoute() {
  const { user } = Route.useRouteContext()
  const view = useQuery(hostQueries.view())
  const host = view.data?.state === 'unpaired' ? undefined : view.data?.host

  return <AccountFlow host={host} identity={{ name: user.name, email: user.email }} />
}
