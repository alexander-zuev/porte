import { createDatabase } from '@server/infrastructure/persistence/database/connection.ts'
import type { Db } from '@server/infrastructure/persistence/database/types.ts'
import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'

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

const BOOKMARK_COOKIE = 'd1-bookmark'

/** Methods that only read, so their session may start from a bookmark. */
const READ_METHODS = new Set(['GET', 'HEAD'])

/**
 * Paths where the writer and the reader are different clients.
 *
 * The daemon polls the device grant while the phone approves it, so the
 * approval it waits for was written under a bookmark it never receives.
 */
const CROSS_CLIENT_PREFIXES = ['/api/auth', '/api/host/ws']

/**
 * Bound the cookie's life, matching Cloudflare's own example.
 *
 * This is hygiene, not speed: a bookmark means "at least this fresh", so an old
 * one is satisfied by every replica and constrains nothing either way.
 */
const BOOKMARK_MAX_AGE = 60 * 60

/**
 * Choose where the session's first query may run.
 *
 * Only the first query is placed. Sequential consistency pins everything after
 * it, so this is the one decision the request gets to make.
 *
 * A mutating request starts at the primary because it usually reads before it
 * writes, and deciding from a stale replica is how a write goes wrong. A read
 * starts from its own bookmark, which is as fresh as anything it has written.
 */
const pickConstraint = createServerOnlyFn((method: string, pathname: string) => {
  if (!READ_METHODS.has(method)) return 'first-primary'
  if (CROSS_CLIENT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return 'first-primary'
  return getCookie(BOOKMARK_COOKIE) ?? 'first-unconstrained'
})

/**
 * Open a D1 session and bind it as this request's connection.
 *
 * Binding is what adopts the session: handlers read `deps.db()`, so a session
 * nothing is bound to would leave every query on the primary.
 */
const bindD1Session = createServerOnlyFn(
  (deps: RequestConnectionBinder, constraint: string, d1: D1Database) => {
    const session = d1.withSession(constraint)
    deps.useDb(createDatabase(session))
    return session
  },
)

/**
 * Carry the session's position into the next request.
 *
 * The position lives only in memory, so without this cookie the next request
 * starts unconstrained and may read a replica older than what this one wrote.
 * No queries means no position, and a pointless `Set-Cookie` would cost the
 * response its cacheability.
 */
const persistBookmark = createServerOnlyFn((session: { getBookmark: () => string | null }) => {
  const bookmark = session.getBookmark()
  if (bookmark === null) return

  setCookie(BOOKMARK_COOKIE, bookmark, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: BOOKMARK_MAX_AGE,
  })
})

/**
 * Route reads to a replica while keeping read-your-writes, for every request.
 *
 * Registered globally in `start.ts`, so it covers routes and server functions
 * alike and always runs before a handler resolves the connection. Contexts with
 * no request — Durable Objects, and later queues or cron — never reach it and
 * stay on the primary connection that `createAppDeps` builds.
 */
export const d1SessionMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, context, pathname, request }) => {
    const isWebSocketUpgrade = request.headers.get('upgrade')?.toLowerCase() === 'websocket'
    const session = bindD1Session(
      context.deps,
      pickConstraint(request.method, pathname),
      context.deps.env.DB,
    )

    // getBookmark reports where the session ended, so it has to follow the queries.
    const result = await next()
    // A WebSocket upgrade has immutable response headers, so it cannot carry a bookmark cookie.
    if (!isWebSocketUpgrade) persistBookmark(session)
    return result
  },
)
