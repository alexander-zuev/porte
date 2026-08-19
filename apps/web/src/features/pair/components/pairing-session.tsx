import type { PairingClaim } from '@porte/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { hostQueryKeys } from '#/entities/host/host-queries.ts'
import { PairPage } from '#/pages/pair/pair-page.tsx'
import { claimPairing, confirmPairing } from '#/server/entrypoints/functions/pairing.fn.ts'

import type { PairingFlowProps } from './pairing-flow.tsx'

/** Claim outcomes that are shown as an issue rather than a confirmation. */
const ISSUE_STATE = {
  consumed: 'consumed',
  'account-conflict': 'account-conflict',
  'host-disconnected': 'host-disconnected',
  'server-unavailable': 'server-unavailable',
} as const

type Screen =
  | { readonly kind: 'code'; readonly code: string; readonly error?: string }
  | { readonly kind: 'expired' }
  | { readonly kind: 'confirm'; readonly claim: Extract<PairingClaim, { state: 'confirm' }> }
  | { readonly kind: 'waiting'; readonly claim: Extract<PairingClaim, { state: 'confirm' }> }
  | { readonly kind: 'issue'; readonly issue: keyof typeof ISSUE_STATE }
  | { readonly kind: 'success'; readonly claim: Extract<PairingClaim, { state: 'confirm' }> }

/** Drive one pairing attempt from code entry to a paired Mac. */
export function PairingSession() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [screen, setScreen] = useState<Screen>({ kind: 'code', code: '' })

  const claim = useMutation({
    mutationFn: (code: string) => claimPairing({ data: { code } }),
    onSuccess: (result) => {
      if (result.state === 'confirm') {
        setScreen({ kind: 'confirm', claim: result })
        return
      }
      if (result.state === 'expired') {
        setScreen({ kind: 'expired' })
        return
      }
      if (result.state === 'invalid') {
        setScreen((current) => ({
          kind: 'code',
          code: current.kind === 'code' ? current.code : '',
          error: 'That code is expired or already used',
        }))
        return
      }
      setScreen({ kind: 'issue', issue: ISSUE_STATE[result.state] })
    },
    onError: () => {
      setScreen({ kind: 'issue', issue: 'server-unavailable' })
    },
  })

  const confirm = useMutation({
    mutationFn: () => confirmPairing(),
    onSuccess: async (result) => {
      if (screen.kind !== 'confirm' && screen.kind !== 'waiting') return
      if (result.state === 'paired') {
        await queryClient.invalidateQueries({ queryKey: hostQueryKeys.all })
        setScreen({ kind: 'success', claim: screen.claim })
        return
      }
      if (result.state === 'waiting-for-desktop') {
        setScreen({ kind: 'waiting', claim: screen.claim })
        return
      }
      if (result.state === 'confirmation-mismatch') {
        setScreen({ kind: 'issue', issue: 'consumed' })
        return
      }
      setScreen({ kind: 'issue', issue: ISSUE_STATE[result.state] })
    },
    onError: () => {
      setScreen({ kind: 'issue', issue: 'server-unavailable' })
    },
  })

  const restart = () => {
    setScreen({ kind: 'code', code: '' })
  }

  const leave = () => {
    void navigate({ to: '/dashboard' })
  }

  return <PairPage {...toFlowProps()} />

  function toFlowProps(): PairingFlowProps {
    if (screen.kind === 'expired') return { view: 'expired', onEnterCode: restart }

    if (screen.kind === 'issue') {
      return {
        view: 'issue',
        issue: screen.issue,
        pending: false,
        onPrimary: screen.issue === 'consumed' ? leave : restart,
        onCancel: leave,
      }
    }

    if (screen.kind === 'success') {
      return { view: 'success', host: screen.claim.host, onContinue: leave }
    }

    if (screen.kind === 'waiting') {
      return {
        view: 'waiting-for-desktop',
        host: screen.claim.host,
        verificationPhrase: screen.claim.verificationPhrase,
        onCancel: leave,
      }
    }

    if (screen.kind === 'confirm') {
      return {
        view: confirm.isPending ? 'confirming' : 'confirm',
        host: screen.claim.host,
        accountLabel: screen.claim.accountLabel,
        verificationPhrase: screen.claim.verificationPhrase,
        onConfirm: () => {
          confirm.mutate()
        },
        onCancel: leave,
      }
    }

    return {
      view: 'code-entry',
      code: screen.code,
      error: screen.error,
      pending: claim.isPending,
      onCodeChange: (code) => {
        setScreen({ kind: 'code', code })
      },
      onSubmit: () => {
        claim.mutate(screen.code)
      },
    }
  }
}
