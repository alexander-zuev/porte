import { spawnSync } from 'node:child_process'
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** True when the grok binary is on PATH. */
export function grokOnPath(): boolean {
  return spawnSync('grok', ['--version'], { encoding: 'utf8' }).status === 0
}

/** Create one empty git repository in a temp directory. */
export async function createGitWorkspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'porte-list-'))
  const repo = spawnSync('git', ['init', '--quiet', cwd], { encoding: 'utf8' })
  if (repo.status !== 0) throw new Error(repo.stderr || 'git init failed')
  // Grok records the real path; macOS /var is a symlink to /private/var.
  return realpath(cwd)
}
