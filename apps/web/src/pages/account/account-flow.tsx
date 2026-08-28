import type { PairedHost } from '@porte/core/client'
import type { HostConnectionStatus } from '@web/entities/host/host-connection.ts'
import type { AccountIdentity } from '@web/features/account/components/account-panel.tsx'
import { useAccountActions } from '@web/features/account/hooks/use-account-actions.ts'

import { AccountPage } from './account-page.tsx'

export type AccountFlowProps = {
  readonly identity: AccountIdentity
  readonly host?: PairedHost
  readonly connection: HostConnectionStatus
}

/** Run the account actions and route the user to wherever each one leaves them. */
export function AccountFlow({ identity, host, connection }: AccountFlowProps) {
  const actions = useAccountActions()

  return (
    <AccountPage
      connection={connection}
      deleteConfirming={actions.deleteConfirming}
      failure={actions.failure}
      host={host}
      identity={identity}
      pending={actions.pending}
      onCancelDelete={actions.onCancelDelete}
      onConfirmDelete={actions.onConfirmDelete}
      onRequestDelete={actions.onRequestDelete}
      onUnpair={actions.onUnpair}
    />
  )
}
