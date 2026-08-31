import { execFile } from 'node:child_process'
import { access, constants, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

async function runScript(path: string): Promise<string> {
  return (await run('bash', [path])).stdout
}

import {
  installGrokHook,
  installStatusLineScript,
  removeGrokHook,
} from '@host/infrastructure/grok/hook-installer.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { version } from '../../package.json'

let grokHome: string
let porteHome: string

beforeEach(async () => {
  grokHome = await mkdtemp(join(tmpdir(), 'porte-grok-'))
  porteHome = await mkdtemp(join(tmpdir(), 'porte-home-'))
})

afterEach(async () => {
  await rm(grokHome, { recursive: true, force: true })
  await rm(porteHome, { recursive: true, force: true })
})

describe('installGrokHook', () => {
  it('writes the hook config and an executable script on first install', async () => {
    const result = await installGrokHook({ grokHome, porteHome })

    expect(result).toEqual({ changed: true })
    const config = JSON.parse(await readFile(join(grokHome, 'hooks', 'porte.json'), 'utf8'))
    const scriptPath = join(porteHome, 'hook', 'porte-hook.sh')
    expect(config.hooks.UserPromptSubmit[0].hooks[0].command).toBe(scriptPath)
    expect(await readFile(scriptPath, 'utf8')).toContain(`@porte/cli@${version}`)
    await access(scriptPath, constants.X_OK)
  })

  it('removes both hook files, and removing again is a no-op', async () => {
    await installGrokHook({ grokHome, porteHome })

    await removeGrokHook({ grokHome, porteHome })
    await removeGrokHook({ grokHome, porteHome })

    await expect(readFile(join(grokHome, 'hooks', 'porte.json'), 'utf8')).rejects.toThrow()
  })

  it('writes an executable status-line script', async () => {
    expect(await installStatusLineScript(porteHome)).toBe(true)
    await access(join(porteHome, 'statusline.sh'), constants.X_OK)
    expect(await installStatusLineScript(porteHome)).toBe(false)
  })

  it('status line reads on only while the writer pid is alive', async () => {
    await installStatusLineScript(porteHome)
    const script = join(porteHome, 'statusline.sh')
    const { writeFile } = await import('node:fs/promises')

    await writeFile(
      join(porteHome, 'rc-state.json'),
      JSON.stringify({ status: 'on', url: 'u', pid: process.pid }),
    )
    expect(await runScript(script)).toContain('/rc on')

    const deadPid = Number((await run('bash', ['-c', 'echo $$'])).stdout.trim())
    await writeFile(
      join(porteHome, 'rc-state.json'),
      JSON.stringify({ status: 'on', url: 'u', pid: deadPid }),
    )
    expect(await runScript(script)).toContain('/rc off')
  })

  it('changes nothing when the installed files are current', async () => {
    await installGrokHook({ grokHome, porteHome })

    expect(await installGrokHook({ grokHome, porteHome })).toEqual({ changed: false })
  })

  it('replaces an outdated script', async () => {
    await installGrokHook({ grokHome, porteHome })
    const scriptPath = join(porteHome, 'hook', 'porte-hook.sh')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(scriptPath, '#!/bin/bash\n# stale\n')

    const result = await installGrokHook({ grokHome, porteHome })

    expect(result).toEqual({ changed: true })
    expect(await readFile(scriptPath, 'utf8')).not.toContain('stale')
  })
})
