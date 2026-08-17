import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { VERSION } from '../src/version.ts'

const main = join(import.meta.dirname, '../src/main.ts')

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', main, ...args], {
    encoding: 'utf8',
    env: process.env,
  })
}

describe('lras process', () => {
  it('prints version and exits 0', () => {
    const result = runCli(['--version'])
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(VERSION)
    expect(result.stderr).toBe('')
  })

  it('prints help on stdout and exits 0', () => {
    const result = runCli(['--help'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('lras <command>')
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
    expect(result.stderr).toContain('lras list')
  })

  it('exits 2 when host configuration is missing', () => {
    const result = runCli(['up'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('LRAS_DAEMON_TOKEN')
    expect(result.stdout).toBe('')
  })
})
