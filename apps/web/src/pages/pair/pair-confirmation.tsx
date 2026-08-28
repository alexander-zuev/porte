import { useSuspenseQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { pairingQueries } from '@web/entities/pairing/pairing-queries.ts'
import { useDecidePairing } from '@web/features/pair/hooks/use-decide-pairing.ts'

import { PairPage } from './pair-page.tsx'

/**
 * Decide the claimed code.
 *
 * Which code that is lives in a cookie the server set when it was claimed, so
 * this route needs no parameter and the code stays out of browser history.
 */
export function PairConfirmation() {
  const { user } = useRouteContext({ from: '/_auth' })
  const claim = useSuspenseQuery(pairingQueries.claim())
  const decision = useDecidePairing()

  return (
    <PairPage
      view="confirm"
      accountImage={user.image}
      accountLabel={user.email}
      pending={decision.pending}
      requestedFrom={claim.data.claimed ? claim.data.requestedFrom : { origin: 'unknown' }}
      onApprove={decision.onApprove}
      onDeny={decision.onDeny}
    />
  )
}
