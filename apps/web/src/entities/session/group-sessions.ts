import type { SessionSummary } from '@lras/core'

export type SessionGroup = {
  readonly cwd: string
  readonly sessions: readonly SessionSummary[]
}

/** Group session rows by repo path. Newest row first inside each group. */
export function groupSessionsByCwd(sessions: readonly SessionSummary[]): readonly SessionGroup[] {
  const groups = new Map<string, SessionSummary[]>()
  for (const session of sessions) {
    const rows = groups.get(session.cwd) ?? []
    rows.push(session)
    groups.set(session.cwd, rows)
  }
  return [...groups.entries()].map(([cwd, rows]) => ({
    cwd,
    sessions: rows.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  }))
}

export function repoName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts.at(-1) ?? cwd
}
