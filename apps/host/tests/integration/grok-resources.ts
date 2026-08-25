import { spawnSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GrokCodingAgent } from '@host/infrastructure/grok/grok-coding-agent.ts'

/** True when the grok binary is on PATH. */
export function grokOnPath(): boolean {
  return spawnSync('grok', ['--version'], { encoding: 'utf8' }).status === 0
}

/** Create one empty git repository in a temp directory. */
export async function createGitWorkspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'porte-list-'))
  const repo = spawnSync('git', ['init', '--quiet', cwd], { encoding: 'utf8' })
  if (repo.status !== 0) throw new Error(repo.stderr || 'git init failed')
  return cwd
}

/** Run work against one Grok coding agent and abort its host signal afterwards. */
export async function withGrokCodingAgent(
  body: (agent: GrokCodingAgent) => Promise<void>,
): Promise<void> {
  const shutdown = new AbortController()
  try {
    await body(new GrokCodingAgent(shutdown.signal))
  } finally {
    shutdown.abort()
  }
}
