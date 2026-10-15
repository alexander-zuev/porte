import { join } from 'node:path'

import { resolveCommand } from '@host/infrastructure/node/resolve-command.ts'
import { describe, expect, it } from 'vitest'

const windows = (files: readonly string[]) => ({
  platform: 'win32' as const,
  env: { Path: 'C:\\missing;D:\\nodejs', PATHEXT: '.COM;.EXE;.BAT;.CMD' },
  exists: (path: string) => files.includes(path),
})

describe('resolveCommand', () => {
  it('leaves commands alone outside Windows', () => {
    expect(resolveCommand('grok', { ...windows([]), platform: 'linux' })).toEqual({
      command: 'grok',
      shell: false,
    })
  })

  it('runs a Windows executable directly', () => {
    const exe = join('D:\\nodejs', 'grok.exe')
    expect(resolveCommand('grok', windows([exe]))).toEqual({ command: exe, shell: false })
  })

  it('runs an npm batch shim through the shell, quoted', () => {
    const shim = join('D:\\nodejs', 'grok.cmd')
    expect(resolveCommand('grok', windows([shim]))).toEqual({ command: `"${shim}"`, shell: true })
  })

  it('falls back to the bare name so spawn reports ENOENT', () => {
    expect(resolveCommand('grok', windows([]))).toEqual({ command: 'grok', shell: false })
  })
})
