import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { AccountFlow } from '@web/features/account/components/account-flow.tsx'
import { useHostConnection } from '@web/lib/host/use-host-connection.ts'

export const Route = createFileRoute('/_auth/_relay/account')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(hostQueries.forAccount()),
      context.queryClient.ensureQueryData(hostQueries.status()),
    ]),
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
