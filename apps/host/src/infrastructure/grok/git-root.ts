import { existsSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

/**
 * The repository a directory belongs to, or undefined outside one.
 *
 * Mirrors what Grok records as a session facet, for the one case Grok has not
 * recorded yet: a conversation this host is creating right now.
 *
 * Nearest match wins, so a submodule reports itself rather than its parent. A
 * `.git` file counts as well as a directory, which is how a worktree resolves
 * to the worktree rather than to the checkout it was cut from.
 */
export function findGitRoot(cwd: string): string | undefined {
  let directory = resolve(cwd)
  for (;;) {
    if (existsSync(`${directory}${sep}.git`)) return directory
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

/**
 * One spelling for one repository.
 *
 * Grok writes its facet with a trailing separator and this host resolves paths
 * without one. Both are the same repository, and the browser groups on the
 * string, so they have to arrive spelled the same way.
 */
export function normaliseGitRoot(gitRoot: string): string {
  const trimmed = gitRoot.endsWith(sep) ? gitRoot.slice(0, -sep.length) : gitRoot
  return trimmed.length > 0 ? trimmed : sep
}
