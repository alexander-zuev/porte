import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const main = join(import.meta.dirname, '../../src/main.ts')

function grokOnPath(): boolean {
  const result = spawnSync('grok', ['--version'], { encoding: 'utf8' })
  return result.status === 0
}

function runLras(args: readonly string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', main, ...args], {
    encoding: 'utf8',
    env: process.env,
    timeout: 180_000,
  })
}

describe('e2e resume against installed grok', () => {
  it('creates a session, resumes it, and writes a file', async () => {
    if (!grokOnPath()) {
      throw new Error('grok is not on PATH; e2e requires installed Grok Build')
    }

    const cwd = await mkdtemp(join(tmpdir(), 'lras-e2e-'))
    const seeded = spawnSync(
      'grok',
      [
        '--no-auto-update',
        '-p',
        'Reply with the single word hi.',
        '--cwd',
        cwd,
        '--output-format',
        'json',
        '--always-approve',
      ],
      { encoding: 'utf8', timeout: 180_000, env: process.env },
    )
    expect(seeded.status, seeded.stderr).toBe(0)
    const sessionId = readSessionId(seeded.stdout)
    expect(sessionId.length).toBeGreaterThan(0)

    const listed = runLras(['list'])
    expect(listed.status).toBe(0)
    const rows = sessionListSchema.parse(JSON.parse(listed.stdout))
    expect(rows.some((row) => row.id === sessionId)).toBe(true)

    const marker = join(cwd, 'e2e-ok.txt')
    const resumed = runLras([
      'resume',
      sessionId,
      '--prompt',
      `Write ${marker} with the single line e2e-ok. Do nothing else.`,
    ])
    expect(resumed.status, resumed.stderr).toBe(0)
    expect(resumed.stdout).toContain('agent_message_chunk')
    expect(resumed.stdout).toContain('tool_call')
    const written = await readFile(marker, 'utf8')
    expect(written.trim()).toBe('e2e-ok')
  }, 300_000)
})

const sessionListSchema = z.array(z.object({ id: z.string() }))

const grokJsonSchema = z.object({
  sessionId: z.string().min(1),
})

function readSessionId(stdout: string): string {
  return grokJsonSchema.parse(JSON.parse(stdout)).sessionId
}
