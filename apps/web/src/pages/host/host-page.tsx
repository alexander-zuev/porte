import {
  HostManagement,
  type HostManagementProps,
} from '@web/features/host/components/host-management.tsx'

/** Props for the paired-host management page. */
export type HostPageProps = HostManagementProps

/** Place the paired-host flow in its responsive page shell. */
export function HostPage(props: HostPageProps) {
  return <HostManagement {...props} />
}
