import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { disableLeaderMode, enableLeaderMode } from '@host/infrastructure/grok/hook-installer.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let grokHome: string
const configPath = () => join(grokHome, 'config.toml')

beforeEach(async () => {
  grokHome = await mkdtemp(join(tmpdir(), 'porte-grok-'))
})

afterEach(async () => {
  await rm(grokHome, { recursive: true, force: true })
})

describe('enableLeaderMode', () => {
  it('adds use_leader under an existing [cli] section and touches nothing else', async () => {
    await writeFile(
      configPath(),
      '# mine\n[cli]\ninstaller = "npm"\n\n[permission]\ndeny = ["Bash(sudo *)"]\n',
    )
    expect(await enableLeaderMode(grokHome)).toBe(true)
    expect(await readFile(configPath(), 'utf8')).toBe(
      '# mine\n[cli]\nuse_leader = true\ninstaller = "npm"\n\n[permission]\ndeny = ["Bash(sudo *)"]\n',
    )
    expect(await enableLeaderMode(grokHome)).toBe(false)
  })

  it('flips a false value and appends a [cli] section when there is none', async () => {
    await writeFile(configPath(), '[cli]\nuse_leader = false\n')
    await enableLeaderMode(grokHome)
    expect(await readFile(configPath(), 'utf8')).toBe('[cli]\nuse_leader = true\n')

    await writeFile(configPath(), '[permission]\nask = []\n')
    await enableLeaderMode(grokHome)
    expect(await readFile(configPath(), 'utf8')).toBe(
      '[permission]\nask = []\n\n[cli]\nuse_leader = true\n',
    )
  })

  it('creates the file when Grok has no config yet', async () => {
    await enableLeaderMode(grokHome)
    expect(await readFile(configPath(), 'utf8')).toBe('[cli]\nuse_leader = true\n')
  })

  it('finds a [cli] header that carries a comment, never adding a second table', async () => {
    await writeFile(configPath(), '[cli] # mine\ninstaller = "npm"\n')
    await enableLeaderMode(grokHome)
    expect(await readFile(configPath(), 'utf8')).toBe(
      '[cli] # mine\nuse_leader = true\ninstaller = "npm"\n',
    )
  })
})

describe('disableLeaderMode', () => {
  it('removes the line and is a no-op without it or without a file', async () => {
    await writeFile(configPath(), '[cli]\nuse_leader = true\ninstaller = "npm"\n')
    expect(await disableLeaderMode(grokHome)).toBe(true)
    expect(await readFile(configPath(), 'utf8')).toBe('[cli]\ninstaller = "npm"\n')
    expect(await disableLeaderMode(grokHome)).toBe(false)
    await rm(configPath())
    expect(await disableLeaderMode(grokHome)).toBe(false)
  })
})
