import type { PairingClaim } from '@porte/core/client'
import { claimPairing } from '@server/entrypoints/functions/pairing.fn.ts'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

/** Why a code did not take, said where the person can act on it: at the field. */
const CLAIM_MESSAGE = {
  invalid: 'That code is not valid',
  expired: 'That code expired. Run porte pair again for a new one',
  'already-decided': 'That code was already answered',
} satisfies Record<Exclude<PairingClaim['state'], 'claimed'>, string>

export type ClaimPairing = {
  readonly code: string
  readonly error: string | undefined
  readonly pending: boolean
  readonly onCodeChange: (code: string) => void
  readonly onSubmit: () => void
}

/**
 * Claim a code, then hand the decision to its own route.
 *
 * The typed code is the only state here; how the last attempt went lives in
 * the mutation.
 */
export function useClaimPairing(): ClaimPairing {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  const claim = useMutation({
    mutationFn: (value: string) => claimPairing({ data: value }),
    onSuccess: async (result) => {
      if (result.state === 'claimed') await navigate({ to: '/pair/confirm' })
    },
  })

  return {
    code,
    error: claimError(),
    pending: claim.isPending,
    onCodeChange: setCode,
    onSubmit: () => {
      claim.mutate(code)
    },
  }

  function claimError(): string | undefined {
    if (claim.isError) return 'Porte did not respond. Try again'
    if (claim.data === undefined || claim.data.state === 'claimed') return undefined
    return CLAIM_MESSAGE[claim.data.state]
  }
}
