import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { VERSION } from '../../src/cli/version.ts'

const main = join(import.meta.dirname, '../../src/main.ts')

function runCli(args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ['--import', 'tsx', main, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

/** A path nothing can have written, so the run cannot see a real credential. */
const UNPAIRED = join(import.meta.dirname, 'no-such-directory', 'credentials.json')

describe('porte process', () => {
  it('prints version and exits 0', () => {
    const result = runCli(['--version'])
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(VERSION)
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

  it('exits 2 when the session is missing', () => {
    const result = runCli(['resume', 'does-not-exist', '--prompt', 'hi'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('ENOTFOUND')
    expect(result.stderr).toContain('porte list')
  })

  it('exits 2 when this machine has not paired', () => {
    const result = runCli(['up'], { PORTE_CREDENTIAL_PATH: UNPAIRED })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('porte pair')
    expect(result.stdout).toBe('')
  })
})
