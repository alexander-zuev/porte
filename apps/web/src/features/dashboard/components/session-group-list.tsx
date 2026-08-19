import { CircleIcon } from '@phosphor-icons/react'
import type { SessionSummary } from '@porte/core'

import { groupSessionsByCwd, repoName } from '#/entities/session/group-sessions.ts'
import { Badge } from '#/ui/components/ui/badge.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import { Spinner } from '#/ui/components/ui/spinner.tsx'

type SessionGroupListProps = {
  readonly sessions: readonly SessionSummary[]
  readonly runningSessionIds: ReadonlySet<string>
  readonly openingSessionId?: string
  readonly selectedSessionId?: string
  readonly onOpenSession: (sessionId: string) => void
}

export function SessionGroupList({
  sessions,
  runningSessionIds,
  openingSessionId,
  selectedSessionId,
  onOpenSession,
}: SessionGroupListProps) {
  const groups = groupSessionsByCwd(sessions)
  return (
    <nav aria-label="Sessions" className="flex flex-col gap-7 px-3 py-5">
      {groups.map((group) => (
        <section key={group.cwd} className="flex min-w-0 flex-col gap-2">
          <header className="flex min-w-0 flex-col gap-1 px-2">
            <h2>{repoName(group.cwd)}</h2>
            <small className="truncate text-muted-foreground" title={group.cwd}>
              {group.cwd}
            </small>
          </header>
          <ul className="flex flex-col gap-1">
            {group.sessions.map((session) => (
              <SessionRow
                key={session.id}
                opening={openingSessionId === session.id}
                pending={openingSessionId !== undefined}
                running={runningSessionIds.has(session.id)}
                selected={selectedSessionId === session.id}
                session={session}
                onOpenSession={onOpenSession}
              />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

function SessionRow({
  session,
  opening,
  pending,
  running,
  selected,
  onOpenSession,
}: {
  readonly session: SessionSummary
  readonly opening: boolean
  readonly pending: boolean
  readonly running: boolean
  readonly selected: boolean
  readonly onOpenSession: (sessionId: string) => void
}) {
  return (
    <li>
      <Button
        aria-current={selected ? 'page' : undefined}
        className="h-auto min-h-16 w-full justify-between gap-3 px-3 py-3 text-left"
        disabled={pending}
        type="button"
        variant={selected ? 'secondary' : 'ghost'}
        onClick={() => {
          onOpenSession(session.id)
        }}
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <strong className="w-full truncate">{session.title}</strong>
          <small className="text-muted-foreground">{formatUpdatedAt(session.updatedAt)}</small>
        </span>
        {opening ? <Spinner aria-label="Opening session" /> : null}
        {running && !opening ? (
          <Badge variant="secondary">
            <CircleIcon aria-hidden data-icon="inline-start" weight="fill" />
            Running
          </Badge>
        ) : null}
      </Button>
    </li>
  )
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value))
}
