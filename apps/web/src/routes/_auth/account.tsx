import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useHostConnection } from '@web/features/relay/use-host-connection.ts'
import { AccountFlow } from '@web/pages/account/account-flow.tsx'

export const Route = createFileRoute('/_auth/account')({
  loader: ({ context }) => context.queryClient.ensureQueryData(hostQueries.forAccount()),
  component: AccountRoute,
})

function AccountRoute() {
  const { user } = Route.useRouteContext()
  const owned = useQuery(hostQueries.forAccount())
  const connection = useHostConnection()
  const host = owned.data?.state === 'paired' ? owned.data.host : undefined

  return (
    <AccountFlow
      connection={connection.status}
      host={host}
      identity={{ name: user.name, email: user.email }}
    />
  )
}
