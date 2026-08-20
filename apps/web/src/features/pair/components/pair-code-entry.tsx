import type { PairingClaim } from '@porte/core'
import { claimPairing } from '@server/entrypoints/functions/pairing.fn.ts'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useRouteContext, useSearch } from '@tanstack/react-router'
import { PairPage } from '@web/pages/pair/pair-page.tsx'
import { useState } from 'react'

import type { PairingFlowProps } from './pairing-flow.tsx'

/** Why a code did not take, said where the person can act on it: at the field. */
const CLAIM_MESSAGE = {
  invalid: 'That code is not valid',
  expired: 'That code expired. Run porte pair again for a new one',
  'already-decided': 'That code was already answered',
} satisfies Record<Exclude<PairingClaim['state'], 'claimed'>, string>

/**
 * Claim a code, then hand the decision to its own route.
 *
 * The typed code is the only state here. Everything else is derived: how the
 * last attempt went lives in the mutation, and an attempt decided on another
 * route arrives in the URL.
 */
export function PairCodeEntry() {
  const navigate = useNavigate()
  const { issue } = useSearch({ from: '/_auth/pair/' })
  const { user } = useRouteContext({ from: '/_auth' })
  const [code, setCode] = useState('')

  const claim = useMutation({
    mutationFn: (value: string) => claimPairing({ data: value }),
    onSuccess: async (result) => {
      if (result.state === 'claimed') await navigate({ to: '/pair/confirm' })
    },
  })

  return <PairPage {...toFlowProps()} />

  function toFlowProps(): PairingFlowProps {
    // A decision made elsewhere ended the attempt, so it opens as a dead end.
    if (issue !== undefined) {
      return {
        view: 'issue',
        issue,
        onRestart: () => {
          void navigate({ to: '/pair', search: {} })
        },
        onCancel: () => {
          void navigate({ to: '/dashboard' })
        },
      }
    }

    return {
      view: 'code-entry',
      accountLabel: user.email,
      accountImage: user.image,
      code,
      error: claimError(),
      pending: claim.isPending,
      onCodeChange: setCode,
      onSubmit: () => {
        claim.mutate(code)
      },
    }
  }

  function claimError(): string | undefined {
    if (claim.isError) return 'Porte did not respond. Try again'
    if (claim.data === undefined || claim.data.state === 'claimed') return undefined
    return CLAIM_MESSAGE[claim.data.state]
  }
}
