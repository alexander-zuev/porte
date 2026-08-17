import type { SessionSummary } from '@lras/core'

import { SessionStore } from '../sessions/session-store.ts'

/**
 * List sessions as JSON rows.
 *
 * @param store - Disk session store.
 */
export async function listSessions(store: SessionStore): Promise<SessionSummary[]> {
  const listed = await store.list()
  return listed.map((row) => row.summary)
}
