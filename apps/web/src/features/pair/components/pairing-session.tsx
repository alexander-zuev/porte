import type { PairingCode, PairingVerdict } from '@porte/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'

import { hostQueryKeys } from '#/entities/host/host-queries.ts'
import { PairPage } from '#/pages/pair/pair-page.tsx'
import { claimPairing, decidePairing } from '#/server/entrypoints/functions/pairing.fn.ts'

import type { PairingFlowProps, PairingIssue } from './pairing-flow.tsx'

type Screen =
  | { readonly kind: 'code'; readonly code: string; readonly error?: string }
  | { readonly kind: 'confirm'; readonly code: PairingCode }
  | { readonly kind: 'approved' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'issue'; readonly issue: PairingIssue }

/** Drive one pairing attempt from code entry to an answered code. */
export function PairingSession() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useRouteContext({ from: '/_auth' })
  const [screen, setScreen] = useState<Screen>({ kind: 'code', code: '' })

  const claim = useMutation({
    mutationFn: (code: string) => claimPairing({ data: code }),
    onSuccess: (result, code) => {
      if (result.state === 'claimed') {
        setScreen({ kind: 'confirm', code })
        return
      }
      if (result.state === 'invalid') {
        setScreen({ kind: 'code', code, error: 'That code is expired or already used' })
        return
      }
      setScreen({ kind: 'issue', issue: result.state })
    },
    onError: () => {
      setScreen({ kind: 'issue', issue: 'unavailable' })
    },
  })

  const decide = useMutation({
    mutationFn: (input: { code: PairingCode; verdict: PairingVerdict }) =>
      decidePairing({ data: input }),
    onSuccess: async (result, input) => {
      if (result.state !== 'done') {
        setScreen({ kind: 'issue', issue: result.state })
        return
      }
      if (input.verdict === 'deny') {
        setScreen({ kind: 'denied' })
        return
      }
      // The row appears only once the daemon connects, so refetch on return.
      await queryClient.invalidateQueries({ queryKey: hostQueryKeys.all })
      setScreen({ kind: 'approved' })
    },
    onError: () => {
      setScreen({ kind: 'issue', issue: 'unavailable' })
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
    if (screen.kind === 'approved') return { view: 'approved', onContinue: leave }
    if (screen.kind === 'denied') return { view: 'denied', onDone: leave }

    if (screen.kind === 'issue') {
      return { view: 'issue', issue: screen.issue, onRestart: restart, onCancel: leave }
    }

    if (screen.kind === 'confirm') {
      const { code } = screen
      return {
        view: 'confirm',
        accountLabel: user.email,
        accountImage: user.image,
        pending: decide.isPending,
        onApprove: () => {
          decide.mutate({ code, verdict: 'approve' })
        },
        onDeny: () => {
          decide.mutate({ code, verdict: 'deny' })
        },
      }
    }

    return {
      view: 'code-entry',
      accountLabel: user.email,
      accountImage: user.image,
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
