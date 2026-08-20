import { PlusIcon } from '@phosphor-icons/react'
import { HostStatus } from '@web/ui/components/host-status.tsx'
import { Logo } from '@web/ui/components/logo.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'

type ConversationHomeHeaderProps = {
  readonly hostName: string
  readonly hostStatus: 'loading' | 'online' | 'offline' | 'reconnecting'
  readonly statusDetail?: string
  readonly canCreate: boolean
  readonly onStartConversation: () => void
}

export function ConversationHomeHeader({
  hostName,
  hostStatus,
  statusDetail,
  canCreate,
  onStartConversation,
}: ConversationHomeHeaderProps) {
  return (
    <header className="flex flex-col gap-5 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-4">
        <Logo size="sm" />
        <Button disabled={!canCreate} size="sm" onClick={onStartConversation}>
          <PlusIcon data-icon="inline-start" />
          New conversation
        </Button>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h1>Conversations</h1>
        <div className="flex min-w-0 items-center gap-2">
          <strong className="truncate">{hostName}</strong>
          <HostStatus detail={statusDetail} status={hostStatus} />
        </div>
      </div>
    </header>
  )
}
