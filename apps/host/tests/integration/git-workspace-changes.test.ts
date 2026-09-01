import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GitWorkspaceChanges } from '@host/infrastructure/git/git-workspace-changes.ts'
import { ChangedFilePathSchema } from '@porte/core/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * A real repository, so the flags and byte layouts this adapter relies on are
 * the ones the installed git prints. One commit, then every kind of change.
 */

let root: string
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const write = (path: string, content: string | Buffer) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), content)
}
const path = (value: string) => ChangedFilePathSchema.parse(value)

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'porte-changes-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@porte.dev')
  git('config', 'user.name', 'Porte Test')
  write('src/kept.ts', 'export const kept = 1\n')
  write('src/edited.ts', 'line one\nline two\nline three\n')
  write('LICENSE', 'MIT\n')
  write('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))
  git('add', '.')
  git('commit', '-q', '-m', 'base')

  write('src/edited.ts', 'line one\nline 2\nline three\nline four\n')
  rmSync(join(root, 'LICENSE'))
  write('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x02]))
  write('src/staged.ts', 'export const staged = true\n')
  git('add', 'src/staged.ts')
  write('docs/notes/new.md', '# New\n\nsecond line\n')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('GitWorkspaceChanges on a real repository', () => {
  const reader = new GitWorkspaceChanges()

  it('lists every kind of change with the counts git reports', async () => {
    const changes = await reader.list(root)
    expect(changes.branch).toBe('main')
    expect(changes.files).toEqual(
      expect.arrayContaining([
        { kind: 'text', path: 'src/edited.ts', status: 'modified', added: 2, removed: 1 },
        { kind: 'text', path: 'LICENSE', status: 'deleted', added: 0, removed: 1 },
        { kind: 'binary', path: 'logo.png', status: 'modified' },
        { kind: 'text', path: 'src/staged.ts', status: 'added', added: 1, removed: 0 },
        { kind: 'text', path: 'docs/notes/new.md', status: 'untracked', added: 3, removed: 0 },
      ]),
    )
    expect(changes.files).toHaveLength(5)
  })

  it('matches what git diff --stat says for the tracked files', async () => {
    const changes = await reader.list(root)
    const stat = git('diff', 'HEAD', '--numstat', '--no-renames')
    for (const line of stat.trim().split('\n')) {
      const [added, removed, file] = line.split('\t')
      const found = changes.files.find((entry) => entry.path === file)
      if (added === '-') expect(found).toMatchObject({ kind: 'binary' })
      else expect(found).toMatchObject({ added: Number(added), removed: Number(removed) })
    }
  })

  it('returns a unified diff with three lines of context', async () => {
    const result = await reader.get(root, path('src/edited.ts'))
    expect(result).toMatchObject({ kind: 'patch' })
    if (result.kind !== 'patch') return
    expect(result.patch).toContain('@@ -1,3 +1,4 @@')
    expect(result.patch).toContain('-line two')
    expect(result.patch).toContain('+line 2')
    expect(result.patch).toContain('+line four')
  })

  it('shows an untracked file as all added', async () => {
    const result = await reader.get(root, path('docs/notes/new.md'))
    expect(result).toMatchObject({ kind: 'patch' })
    if (result.kind !== 'patch') return
    expect(result.patch).toContain('--- /dev/null')
    expect(result.patch).toContain('+# New')
  })

  it('names the binary file', async () => {
    await expect(reader.get(root, path('logo.png'))).resolves.toEqual({ kind: 'binary' })
  })

  it('lists a repository with no commit as all added', async () => {
    const unborn = mkdtempSync(join(tmpdir(), 'porte-unborn-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: unborn })
      writeFileSync(join(unborn, 'first.txt'), 'hello\n')
      const changes = await reader.list(unborn)
      expect(changes.files).toEqual([
        { kind: 'text', path: 'first.txt', status: 'untracked', added: 1, removed: 0 },
      ])
    } finally {
      rmSync(unborn, { recursive: true, force: true })
    }
  })

  it('refuses a directory that is not a repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'porte-plain-'))
    try {
      await expect(reader.list(plain)).rejects.toMatchObject({ _tag: 'WorkspaceNotAllowedError' })
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})
