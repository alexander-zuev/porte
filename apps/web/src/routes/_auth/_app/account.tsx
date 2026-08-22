import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { AccountFlow } from '@web/features/account/components/account-flow.tsx'

export const Route = createFileRoute('/_auth/_app/account')({
  loader: ({ context }) => context.queryClient.ensureQueryData(hostQueries.forAccount()),
  component: AccountRoute,
})

function AccountRoute() {
  const { user } = Route.useRouteContext()
  const owned = useQuery(hostQueries.forAccount())
  const host = owned.data?.state === 'unpaired' ? undefined : owned.data?.host

  return <AccountFlow host={host} identity={{ name: user.name, email: user.email }} />
}
