import { spawnSync } from 'node:child_process'
import { mkdtemp, readdir, realpath, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { describe } from 'vitest'

const WORKSPACE_PREFIX = 'porte-test-'

/** True when the caller enables live tests and the grok binary is on PATH. */
export function liveGrokTestsEnabled(): boolean {
  return (
    process.env.GROK_LIVE_TESTS === '1' &&
    spawnSync('grok', ['--version'], { encoding: 'utf8' }).status === 0
  )
}

/** `describe` for a suite that spends tokens: skipped unless `test:live` runs it. */
export const describeLive = describe.skipIf(!liveGrokTestsEnabled())

const workspaces = new Set<string>()

/** Create one empty git repository in a temp directory. `cleanupGrokSessions` removes it. */
export async function createGitWorkspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), WORKSPACE_PREFIX))
  const repo = spawnSync('git', ['init', '--quiet', cwd], { encoding: 'utf8' })
  if (repo.status !== 0) throw new Error(repo.stderr || 'git init failed')
  // Grok records the real path; macOS /var is a symlink to /private/var.
  const real = await realpath(cwd)
  workspaces.add(real)
  return real
}

/**
 * Remove every test workspace and the Grok sessions created in it, so test runs
 * do not pile up in `session/list`. Grok keeps sessions under
 * `~/.grok/sessions/<encoded cwd>/` plus rows in its search index. Call from `afterAll`,
 * after the test's Grok process has stopped. Also sweeps `porte-test-*` leftovers
 * from earlier runs that never reached their own cleanup (crash, Ctrl-C).
 */
export async function cleanupGrokSessions(): Promise<void> {
  const sessions = join(homedir(), '.grok', 'sessions')
  const stale = await staleWorkspaces(sessions)
  const targets = new Set([...workspaces, ...stale])
  if (targets.size === 0) return
  const index = new DatabaseSync(join(sessions, 'session_search.sqlite'))
  try {
    const remove = index.prepare('DELETE FROM session_docs WHERE cwd = ?')
    for (const cwd of targets) {
      remove.run(cwd)
      await rm(join(sessions, encodeURIComponent(cwd)), { recursive: true, force: true })
      await rm(cwd, { recursive: true, force: true })
    }
    index.exec("INSERT INTO session_docs_fts(session_docs_fts) VALUES('rebuild')")
  } finally {
    index.close()
  }
  workspaces.clear()
}

/** A leftover is stale only when old: another vitest worker's live workspace is minutes fresh. */
const STALE_AGE_MS = 60 * 60 * 1000

async function isStale(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => undefined)
  if (info === undefined) return false
  return Date.now() - info.mtimeMs > STALE_AGE_MS
}

/**
 * Every `porte-test-*` cwd left in the temp dir or the Grok session store by an
 * EARLIER run. Test files run in parallel workers, so a fresh `porte-test-*`
 * dir may belong to a live test in another process — only hour-old leftovers
 * are swept.
 */
async function staleWorkspaces(sessions: string): Promise<string[]> {
  const temp = await realpath(tmpdir())
  const tempDirs = await readdir(temp).catch(() => [])
  const sessionDirs = await readdir(sessions).catch(() => [])
  const candidates = [
    ...tempDirs
      .filter((name) => name.startsWith(WORKSPACE_PREFIX))
      .map((name) => ({ cwd: join(temp, name), probe: join(temp, name) })),
    ...sessionDirs
      .filter((name) => decodeURIComponent(name).includes(`/${WORKSPACE_PREFIX}`))
      .map((name) => ({ cwd: decodeURIComponent(name), probe: join(sessions, name) })),
  ]
  const stale: string[] = []
  for (const candidate of candidates) {
    if (await isStale(candidate.probe)) stale.push(candidate.cwd)
  }
  return stale
}
