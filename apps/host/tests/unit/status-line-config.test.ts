import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  installStatusLineConfig,
  removeStatusLineConfig,
} from '@host/infrastructure/grok/hook-installer.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let grokHome: string
const porteHome = '/home/me/.porte'
const configPath = () => join(grokHome, 'config.toml')

const OURS = `[ui.status_line]
type = "command"
command = "/home/me/.porte/statusline.sh"
refresh_interval = 2
`

beforeEach(async () => {
  grokHome = await mkdtemp(join(tmpdir(), 'porte-grok-'))
})

afterEach(async () => {
  await rm(grokHome, { recursive: true, force: true })
})

describe('installStatusLineConfig', () => {
  it('appends our status line when the config has none', async () => {
    await writeFile(configPath(), '[cli]\nuse_leader = true\n')
    expect(await installStatusLineConfig(grokHome, porteHome)).toBe(true)
    expect(await readFile(configPath(), 'utf8')).toBe(`[cli]\nuse_leader = true\n\n${OURS}`)
    expect(await installStatusLineConfig(grokHome, porteHome)).toBe(false)
  })

  it('rewrites our own older lines and leaves the rest of the file alone', async () => {
    await writeFile(
      configPath(),
      '[ui.status_line]\ntype = "command"\ncommand = "~/.porte/statusline.sh"\nrefresh_interval = 30\n\n[cli]\nuse_leader = true\n',
    )
    expect(await installStatusLineConfig(grokHome, porteHome)).toBe(true)
    expect(await readFile(configPath(), 'utf8')).toBe(`${OURS}\n[cli]\nuse_leader = true\n`)
  })

  it("leaves someone else's status line untouched", async () => {
    const theirs = '[ui.status_line]\ntype = "command"\ncommand = "~/bin/branch.sh"\n'
    await writeFile(configPath(), theirs)
    expect(await installStatusLineConfig(grokHome, porteHome)).toBe(false)
    expect(await readFile(configPath(), 'utf8')).toBe(theirs)
  })
})

describe('removeStatusLineConfig', () => {
  it('removes our section and nothing else', async () => {
    await writeFile(configPath(), `[cli]\nuse_leader = true\n\n${OURS}`)
    expect(await removeStatusLineConfig(grokHome)).toBe(true)
    expect(await readFile(configPath(), 'utf8')).toBe('[cli]\nuse_leader = true\n\n')
  })

  it("keeps someone else's section", async () => {
    const theirs = '[ui.status_line]\ntype = "command"\ncommand = "~/bin/branch.sh"\n'
    await writeFile(configPath(), theirs)
    expect(await removeStatusLineConfig(grokHome)).toBe(false)
    expect(await readFile(configPath(), 'utf8')).toBe(theirs)
  })
})
