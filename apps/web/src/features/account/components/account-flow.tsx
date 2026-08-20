import type { PairedHost } from '@porte/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { hostMutations } from '@web/entities/host/host-mutations.ts'
import { hostQueryKeys } from '@web/entities/host/host-queries.ts'
import { authService } from '@web/lib/auth/auth-service.ts'
import { AccountPage } from '@web/pages/account/account-page.tsx'
import { useState } from 'react'

import type { AccountIdentity, AccountPending } from './account-panel.tsx'

export type AccountFlowProps = {
  readonly identity: AccountIdentity
  readonly host?: PairedHost
}

/** Run the account actions and route the user to wherever each one leaves them. */
export function AccountFlow({ identity, host }: AccountFlowProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [pending, setPending] = useState<AccountPending>('none')

  /**
   * Sign out, then drop the cache once nothing is watching it.
   *
   * Invalidating here would refetch every live query under a session that no
   * longer exists, so the page waits on its own 401s before it can leave.
   * Clearing after the route changes has nothing left to refetch.
   */
  async function endSession(to: '/sign-in' | '/') {
    await queryClient.cancelQueries()
    await authService().signOut()
    await navigate({ to })
    queryClient.clear()
  }

  const unpair = useMutation({
    ...hostMutations.unpair(),
    onMutate: () => {
      setFailure(undefined)
      setPending('unpair')
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setFailure(result.reason)
        return
      }
      await queryClient.invalidateQueries({ queryKey: hostQueryKeys.all })
    },
    onError: () => {
      setFailure('Unpairing failed. This Mac is still paired.')
    },
    onSettled: () => {
      setPending('none')
    },
  })

  const removeAccount = useMutation({
    ...hostMutations.deleteAccount(),
    onMutate: () => {
      setFailure(undefined)
      setPending('delete')
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setFailure(result.reason)
        setPending('none')
        return
      }
      await endSession('/')
    },
    onError: () => {
      setFailure('Deleting failed. Your account is unchanged.')
      setPending('none')
    },
  })

  return (
    <AccountPage
      deleteConfirming={deleteConfirming}
      failure={failure}
      host={host}
      identity={identity}
      pending={pending}
      onCancelDelete={() => {
        setDeleteConfirming(false)
      }}
      onConfirmDelete={() => {
        removeAccount.mutate()
      }}
      onRequestDelete={() => {
        setFailure(undefined)
        setDeleteConfirming(true)
      }}
      onSignOut={() => {
        setPending('signOut')
        void endSession('/sign-in')
      }}
      onUnpair={() => {
        unpair.mutate()
      }}
    />
  )
}
