import type { PairingVerdict } from '@porte/core/client'
import { decidePairing } from '@server/entrypoints/functions/pairing.fn.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { hostQueryKeys } from '@web/entities/host/host-queries.ts'
import { pairingQueryKeys } from '@web/entities/pairing/pairing-queries.ts'

export type DecidePairing = {
  readonly pending: boolean
  readonly onApprove: () => void
  readonly onDeny: () => void
}

/**
 * Decide the claimed code, then leave for the route that outcome owns.
 *
 * Every outcome is a route of its own, because a decision must survive reload.
 */
export function useDecidePairing(): DecidePairing {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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

  return {
    pending: decide.isPending,
    onApprove: () => {
      decide.mutate('approve')
    },
    onDeny: () => {
      decide.mutate('deny')
    },
  }
}
