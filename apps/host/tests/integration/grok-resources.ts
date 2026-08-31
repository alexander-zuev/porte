import { spawnSync } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** True when the caller enables live tests and the grok binary is on PATH. */
export function liveGrokTestsEnabled(): boolean {
  return (
    process.env.GROK_LIVE_TESTS === '1' &&
    spawnSync('grok', ['--version'], { encoding: 'utf8' }).status === 0
  )
}

const workspaces = new Set<string>()

/** Create one empty git repository in a temp directory. `cleanupGrokSessions` removes it. */
export async function createGitWorkspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'porte-test-'))
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
 * after the test's Grok process has stopped.
 */
export async function cleanupGrokSessions(): Promise<void> {
  if (workspaces.size === 0) return
  const sessions = join(homedir(), '.grok', 'sessions')
  const index = new DatabaseSync(join(sessions, 'session_search.sqlite'))
  try {
    const remove = index.prepare('DELETE FROM session_docs WHERE cwd = ?')
    for (const cwd of workspaces) {
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
