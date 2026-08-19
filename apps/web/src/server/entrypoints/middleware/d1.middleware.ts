import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'

import { createDatabase } from '#/server/infrastructure/persistence/database/connection.ts'
import type { Db } from '#/server/infrastructure/persistence/database/types.ts'

/**
 * The narrow rebinding contract this middleware needs.
 *
 * Declared here rather than imported from the composition root, so the
 * middleware never pulls Worker-only modules into a client bundle. `AppDeps`
 * satisfies it structurally.
 */
export type RequestConnectionBinder = {
  useDb: (db: Db) => void
}

/** The only D1 surface Drizzle uses. Both a database and a session provide it. */
type D1Queryable = Pick<D1Database, 'prepare' | 'batch'>

const BOOKMARK_COOKIE = 'd1-bookmark'

/** Where a session with no prior bookmark starts reading. */
const UNCONSTRAINED = 'first-unconstrained'

/**
 * Open a D1 session and bind it for this request.
 *
 * Reads route to the nearest replica; writes always reach the primary. With
 * replication disabled the session is a no-op that reads the primary, so this
 * is safe before the database has replicas.
 */
const bindD1Session = createServerOnlyFn(
  (deps: RequestConnectionBinder, constraint: string, d1: D1Database) => {
    const session = d1.withSession(constraint)
    // A session is not a D1Database: it adds getBookmark and drops exec, dump,
    // and withSession. Drizzle calls neither of those, only the two below, so
    // the session satisfies everything that is actually used.
    const queryable: D1Queryable = session
    // SAFETY: every method Drizzle reaches for is present on the session above.
    const db = createDatabase(queryable as D1Database)
    deps.useDb(db)
    return { session, db }
  },
)

/**
 * Route reads to a replica while keeping read-your-writes.
 *
 * The bookmark cookie carries the last write position, so a replica that has
 * not caught up is never read from after the user changes something.
 */
export const withD1 = createMiddleware({ type: 'function' }).server(async ({ next, context }) => {
  const { session, db } = bindD1Session(
    context.deps,
    getCookie(BOOKMARK_COOKIE) ?? UNCONSTRAINED,
    context.deps.env.DB,
  )

  const result = await next({ context: { db } })

  const bookmark = session.getBookmark()
  if (bookmark !== null) {
    setCookie(BOOKMARK_COOKIE, bookmark, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
  }

  return result
})

/**
 * Route reads to a replica and write no bookmark.
 *
 * For public content that nobody has just written. Omitting the cookie is what
 * keeps the response cacheable at the edge, since `Set-Cookie` would prevent it.
 */
export const withD1ReadOnly = createMiddleware({ type: 'function' }).server(
  async ({ next, context }) => {
    const { db } = bindD1Session(context.deps, UNCONSTRAINED, context.deps.env.DB)
    return next({ context: { db } })
  },
)
