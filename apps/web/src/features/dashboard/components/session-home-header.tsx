import { PlusIcon } from '@phosphor-icons/react'

import { HostStatus } from '#/ui/components/host-status.tsx'
import { Logo } from '#/ui/components/logo.tsx'
import { Button } from '#/ui/components/ui/button.tsx'

type SessionHomeHeaderProps = {
  readonly hostName: string
  readonly hostStatus: 'loading' | 'online' | 'offline' | 'reconnecting'
  readonly statusDetail?: string
  readonly canCreate: boolean
  readonly onStartSession: () => void
}

export function SessionHomeHeader({
  hostName,
  hostStatus,
  statusDetail,
  canCreate,
  onStartSession,
}: SessionHomeHeaderProps) {
  return (
    <header className="flex flex-col gap-5 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-4">
        <Logo size="sm" />
        <Button disabled={!canCreate} size="sm" onClick={onStartSession}>
          <PlusIcon data-icon="inline-start" />
          New session
        </Button>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h1>Sessions</h1>
        <div className="flex min-w-0 items-center gap-2">
          <strong className="truncate">{hostName}</strong>
          <HostStatus detail={statusDetail} status={hostStatus} />
        </div>
      </div>
    </header>
  )
}
