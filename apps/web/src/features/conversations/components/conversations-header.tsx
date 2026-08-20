import { PlusIcon } from '@phosphor-icons/react'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { formatDateTime } from '@web/lib/format-date.ts'
import { HostStatus } from '@web/ui/components/host-status.tsx'
import { Logo } from '@web/ui/components/logo.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'

type ConversationsHeaderProps = {
  readonly hostName: string
  readonly connection: HostConnection
  readonly onStartConversation: () => void
}

/** The Mac, how it is doing, and the one action that does not need it open. */
export function ConversationsHeader({
  hostName,
  connection,
  onStartConversation,
}: ConversationsHeaderProps) {
  const reachable = connection.state === 'ready' || connection.state === 'empty'

  return (
    <header className="flex flex-col gap-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-4">
        <Logo size="sm" />
        <Button className="min-h-11" disabled={!reachable} size="sm" onClick={onStartConversation}>
          <PlusIcon data-icon="inline-start" />
          New conversation
        </Button>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <h1>Conversations</h1>
        <div className="flex min-w-0 items-center gap-2">
          <strong className="truncate">{hostName}</strong>
          <HostStatus detail={lastSeen(connection)} status={toStatus(connection)} />
        </div>
      </div>
    </header>
  )
}

function toStatus(connection: HostConnection): 'loading' | 'online' | 'offline' {
  if (connection.state === 'connecting') return 'loading'
  return connection.state === 'ready' || connection.state === 'empty' ? 'online' : 'offline'
}

/** Only shown when there is a real observation. Null means no daemon ever arrived. */
function lastSeen(connection: HostConnection): string | undefined {
  if (connection.state !== 'offline' && connection.state !== 'stale') return undefined
  return connection.lastSeenAt === null
    ? 'Never connected'
    : `Last seen ${formatDateTime(connection.lastSeenAt)}`
}
