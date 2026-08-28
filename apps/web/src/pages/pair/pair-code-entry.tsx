import { useNavigate, useRouteContext, useSearch } from '@tanstack/react-router'
import type { PairingFlowProps } from '@web/features/pair/components/pairing-flow.tsx'
import { useClaimPairing } from '@web/features/pair/hooks/use-claim-pairing.ts'

import { PairPage } from './pair-page.tsx'

/**
 * The code-entry screen, or the dead end an attempt decided elsewhere leaves.
 *
 * An attempt decided on another route arrives in the URL; everything else
 * comes from the claim.
 */
export function PairCodeEntry() {
  const navigate = useNavigate()
  const { issue } = useSearch({ from: '/_auth/pair/code' })
  const { user } = useRouteContext({ from: '/_auth' })
  const claim = useClaimPairing()

  return <PairPage {...toFlowProps()} />

  function toFlowProps(): PairingFlowProps {
    // A decision made elsewhere ended the attempt, so it opens as a dead end.
    if (issue !== undefined) {
      return {
        view: 'issue',
        issue,
        onRestart: () => {
          void navigate({ to: '/pair/code', search: {} })
        },
        onCancel: () => {
          void navigate({ to: '/conversations' })
        },
      }
    }

    return {
      view: 'code-entry',
      accountLabel: user.email,
      accountImage: user.image,
      ...claim,
    }
  }
}
