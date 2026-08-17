import type { SessionSummary } from '@lras/core'
import { FolderSimpleIcon, PlusIcon } from '@phosphor-icons/react'

import { Button } from '#/components/ui/button.tsx'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import { AppFrame } from '#/ui/app-frame.tsx'
import { HostStatus } from '#/ui/host-status.tsx'

import { groupSessionsByCwd, repoName } from '../models/group-sessions.ts'

export type HomePageProps = {
  readonly online: boolean
  readonly sessions: readonly SessionSummary[]
  readonly onOpenSession: (sessionId: string) => void
  readonly onStartSession: () => void
}

export function HomePage({ online, sessions, onOpenSession, onStartSession }: HomePageProps) {
  const groups = groupSessionsByCwd(sessions)

  return (
    <AppFrame>
      <header className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl">Conversations</h1>
          <HostStatus online={online} />
        </div>
        <Button size="sm" disabled={!online} onClick={onStartSession}>
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
              <h2 className="flex min-w-0 items-baseline gap-2 text-sm font-medium">
                <span className="shrink-0">{repoName(group.cwd)}</span>
                <span className="truncate text-muted-foreground">{group.cwd}</span>
              </h2>
              <ul className="flex flex-col gap-1">
                {group.sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      className="w-full truncate rounded-lg px-3 py-3 text-left font-medium hover:bg-muted"
                      onClick={() => {
                        onOpenSession(session.id)
                      }}
                    >
                      {session.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      )}
    </AppFrame>
  )
}
