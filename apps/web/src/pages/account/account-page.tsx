import {
  AccountPanel,
  type AccountPanelProps,
} from '#/features/account/components/account-panel.tsx'
import { AppShell } from '#/ui/components/app-shell.tsx'

export type AccountPageProps = AccountPanelProps

/** Account surface. One column, reached from the list-pane footer. */
export function AccountPage(props: AccountPageProps) {
  return (
    <AppShell>
      <div className="flex min-h-svh justify-center px-6 py-12">
        <AccountPanel {...props} />
      </div>
    </AppShell>
  )
}
