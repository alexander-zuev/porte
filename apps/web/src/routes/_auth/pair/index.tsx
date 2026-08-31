import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { useAccountActions } from '@web/features/account/hooks/use-account-actions.ts'
import { AlreadyPaired } from '@web/features/pair/components/already-paired.tsx'
import { PairStart } from '@web/features/pair/components/pair-start.tsx'
import { useHostConnection } from '@web/features/relay/use-host-connection.ts'
import { createSeoHead } from '@web/lib/seo.ts'

export const Route = createFileRoute('/_auth/pair/')({
  head: () =>
    createSeoHead({
      title: 'Pair your machine | Porte',
      description:
        'Install the Porte plugin on the machine that runs Grok, then enter the code /remote-control prints.',
      path: '/pair/',
      noIndex: true,
    }),
  component: PairStartRoute,
})

/** The steps for an account with no machine; the machine itself for one that has it. */
function PairStartRoute() {
  const owned = useQuery(hostQueries.forAccount())
  const connection = useHostConnection()
  const actions = useAccountActions()

  if (owned.data?.state !== 'paired') return <PairStart />
  return (
    <AlreadyPaired
      connection={connection.status}
      failure={actions.failure}
      host={owned.data.host}
      unpairing={actions.pending === 'unpair'}
      onUnpair={actions.onUnpair}
    />
  )
}
