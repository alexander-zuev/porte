import { ArrowLeftIcon } from '@phosphor-icons/react'
import type { SessionSummary } from '@porte/core'

import { HostStatus } from '#/ui/components/host-status.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import { Separator } from '#/ui/components/ui/separator.tsx'

/** Connection states visible while one session is selected. */
export type SessionConnection = 'online' | 'offline' | 'reconnecting'

/** Show session identity, repository, host, and the mobile back path. */
export function SessionHeader({
  session,
  hostName,
  connection,
  onBack,
}: {
  readonly session: SessionSummary
  readonly hostName: string
  readonly connection: SessionConnection
  readonly onBack: () => void
}) {
  return (
    <>
      <header className="flex flex-col gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 md:px-5 md:pt-4">
        <div className="flex items-center justify-between gap-4">
          <Button className="md:hidden" variant="ghost" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" />
            Sessions
          </Button>
          <div className="ml-auto flex min-w-0 flex-col items-end gap-1">
            <strong className="max-w-44 truncate">{hostName}</strong>
            <HostStatus status={connection} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate">{session.title}</h1>
          <small className="truncate text-muted-foreground" title={session.cwd}>
            {session.cwd}
          </small>
        </div>
      </header>
      <Separator />
    </>
  )
}
