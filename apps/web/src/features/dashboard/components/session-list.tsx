import { FolderSimpleIcon, PlusIcon } from '@phosphor-icons/react'
import type { SessionSummary } from '@porte/core'

import { groupSessionsByCwd, repoName } from '#/entities/session/group-sessions.ts'
import { HostStatus } from '#/ui/components/host-status.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/ui/components/ui/empty.tsx'
import { Separator } from '#/ui/components/ui/separator.tsx'

export type SessionListProps = {
  readonly online: boolean
  readonly sessions: readonly SessionSummary[]
  readonly onOpenSession: (sessionId: string) => void
  readonly onStartSession: () => void
}

export function SessionList({ online, sessions, onOpenSession, onStartSession }: SessionListProps) {
  const groups = groupSessionsByCwd(sessions)

  return (
    <>
      <header className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex flex-col gap-1">
          <h1>Conversations</h1>
          <HostStatus online={online} />
        </div>
        <Button disabled={!online} size="sm" onClick={onStartSession}>
          <PlusIcon data-icon="inline-start" />
          New
        </Button>
      </header>
      <Separator />
      {groups.length === 0 ? (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderSimpleIcon />
            </EmptyMedia>
            <EmptyTitle>No conversations yet</EmptyTitle>
            <EmptyDescription>
              Pair a host, then resume a session or start one in a known repo.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <nav className="flex flex-col gap-6 px-5 py-4">
          {groups.map((group) => (
            <section key={group.cwd} className="flex flex-col gap-2">
              <h2 className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0">{repoName(group.cwd)}</span>
                <span className="truncate text-muted-foreground">{group.cwd}</span>
              </h2>
              <ul className="flex flex-col gap-1">
                {group.sessions.map((session) => (
                  <li key={session.id}>
                    <Button
                      className="h-auto w-full justify-start truncate px-3 py-3 text-left"
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        onOpenSession(session.id)
                      }}
                    >
                      {session.title}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      )}
    </>
  )
}
