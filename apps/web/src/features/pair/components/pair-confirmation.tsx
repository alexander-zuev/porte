import type { PairingVerdict } from '@porte/core'
import { decidePairing } from '@server/entrypoints/functions/pairing.fn.ts'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { hostQueryKeys } from '@web/entities/host/host-queries.ts'
import { pairingQueries, pairingQueryKeys } from '@web/entities/pairing/pairing-queries.ts'
import { PairPage } from '@web/pages/pair/pair-page.tsx'

/**
 * Decide the claimed code.
 *
 * Which code that is lives in a cookie the server set when it was claimed, so
 * this route needs no parameter and the code stays out of browser history.
 * Every outcome is a route of its own, because a decision must survive reload.
 */
export function PairConfirmation() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useRouteContext({ from: '/_auth' })
  const claim = useSuspenseQuery(pairingQueries.claim())

  const decide = useMutation({
    mutationFn: (verdict: PairingVerdict) => decidePairing({ data: verdict }),
    onSuccess: async (result, verdict) => {
      // Anything the code cannot answer sends them back to the form to retype.
      if (result.state !== 'done') {
        await navigate({ to: '/pair/code', search: { issue: result.state } })
        return
      }
      if (verdict === 'deny') {
        await navigate({ to: '/pair/cancelled' })
        return
      }
      // The row appears only once the daemon connects, so refetch on return.
      await queryClient.invalidateQueries({ queryKey: hostQueryKeys.all })
      await navigate({ to: '/pair/success' })
    },
    onError: async () => {
      await navigate({ to: '/pair/code', search: { issue: 'unavailable' } })
    },
    // Decided either way, the claim is spent and its cookie gone.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: pairingQueryKeys.all })
    },
  })

  return (
    <PairPage
      view="confirm"
      accountImage={user.image}
      accountLabel={user.email}
      pending={decide.isPending}
      requestedFrom={claim.data.claimed ? claim.data.requestedFrom : { origin: 'unknown' }}
      onApprove={() => {
        decide.mutate('approve')
      }}
      onDeny={() => {
        decide.mutate('deny')
      }}
    />
  )
}
