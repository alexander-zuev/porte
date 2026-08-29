import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { VERSION } from '@host/entrypoints/cli/version.ts'
import { describe, expect, it } from 'vitest'

const main = join(import.meta.dirname, '../../src/main.ts')

function runCli(args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ['--import', 'tsx', main, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

/** A path nothing can have written, so the run cannot see a real credential. */
const UNPAIRED = join(import.meta.dirname, 'no-such-directory')

describe('porte process', () => {
  it('prints the version report and exits 0', () => {
    const result = runCli(['--version'], { PORTE_DATA_DIRECTORY: UNPAIRED })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(
      `porte ${VERSION} · node ${process.versions.node} · ${process.platform} ${process.arch}\nnot paired\n`,
    )
    expect(result.stderr).toBe('')
  })

  it('prints help on stdout and exits 0', () => {
    const result = runCli(['--help'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('porte <command>')
    expect(result.stderr).toBe('')
  })

  it('exits 2 for bad argv and writes usage on stderr', () => {
    const result = runCli([])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Usage:')
    expect(result.stdout).toBe('')
  })

  it('exits 2 when this machine has not paired', () => {
    const result = runCli(['up'], { PORTE_DATA_DIRECTORY: UNPAIRED })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('porte pair')
    expect(result.stdout).toBe('')
  })
})
