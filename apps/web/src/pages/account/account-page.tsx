import {
  AccountPanel,
  type AccountPanelProps,
} from '@web/features/account/components/account-panel.tsx'
export type AccountPageProps = AccountPanelProps

/** Account surface. One column, reached from the list-pane footer. */
export function AccountPage(props: AccountPageProps) {
  return <AccountPanel {...props} />
}
