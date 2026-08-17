/** One Grok disk session the daemon can list or resume. */
export type SessionSummary = {
  readonly id: string
  readonly cwd: string
  readonly title: string
  readonly updatedAt: string
}

/**
 * Build a session row from already-mapped fields.
 *
 * @param input - id, cwd, title, and updated time from a Grok `summary.json`.
 */
export function makeSessionSummary(input: SessionSummary): SessionSummary {
  return {
    id: input.id,
    cwd: input.cwd,
    title: input.title,
    updatedAt: input.updatedAt,
  }
}
