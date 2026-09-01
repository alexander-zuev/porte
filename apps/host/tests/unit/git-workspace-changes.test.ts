import {
  EMPTY_TREE,
  GitWorkspaceChanges,
  type GitOutput,
} from '@host/infrastructure/git/git-workspace-changes.ts'
import { CHANGE_PATCH_MAX_BYTES, ChangedFilePathSchema } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

const ROOT = '/repo'
const path = (value: string) => ChangedFilePathSchema.parse(value)

type Answer = { readonly stdout?: string | Buffer; readonly exitCode?: number }

/** Git that answers from a table keyed by the joined argument list, and records every call. */
function fakeGit(answers: Record<string, Answer>) {
  const calls: string[] = []
  const run = (gitRoot: string, args: readonly string[]): Promise<GitOutput> => {
    const key = args.join(' ')
    calls.push(`${gitRoot} ${key}`)
    const answer = answers[key]
    if (answer === undefined) return Promise.reject(new Error(`unexpected git ${key}`))
    const stdout = answer.stdout ?? ''
    return Promise.resolve({
      stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, 'utf8'),
      exitCode: answer.exitCode ?? 0,
    })
  }
  return { run, calls }
}

const HEAD_OK = { 'rev-parse --verify --quiet HEAD': { stdout: 'abc\n' } }
const ON_MAIN = { 'branch --show-current': { stdout: 'main\n' } }

describe('GitWorkspaceChanges.list', () => {
  it('joins counts with statuses and appends untracked files', async () => {
    const git = fakeGit({
      ...HEAD_OK,
      ...ON_MAIN,
      'diff HEAD --numstat -z --no-renames': {
        stdout: '27\t2\tsrc/a.ts\x00-\t-\tlogo.png\x000\t21\tLICENSE\x00',
      },
      'diff HEAD --name-status -z --no-renames': {
        stdout: 'M\0src/a.ts\0M\0logo.png\0D\0LICENSE\0',
      },
      'status --porcelain=v2 -z --no-renames --untracked-files=all': {
        stdout: '1 .M N... 100644 100644 100644 aaa bbb src/a.ts\0? docs/new.md\0',
      },
      // Two names in, so git prints the counts, an empty path, then both names.
      'diff --no-index --numstat -z -- /dev/null docs/new.md': {
        stdout: '17\t0\t\x00/dev/null\x00docs/new.md\x00',
        exitCode: 1,
      },
    })
    const changes = await new GitWorkspaceChanges(git.run).list(ROOT)
    expect(changes).toEqual({
      branch: 'main',
      files: [
        { kind: 'text', path: 'src/a.ts', status: 'modified', added: 27, removed: 2 },
        { kind: 'binary', path: 'logo.png', status: 'modified' },
        { kind: 'text', path: 'LICENSE', status: 'deleted', added: 0, removed: 21 },
        { kind: 'text', path: 'docs/new.md', status: 'untracked', added: 17, removed: 0 },
      ],
    })
    expect(git.calls.every((call) => call.startsWith(`${ROOT} `))).toBe(true)
  })

  it('diffs against the empty tree when HEAD has no commit', async () => {
    const git = fakeGit({
      'rev-parse --verify --quiet HEAD': { exitCode: 128 },
      ...ON_MAIN,
      [`diff ${EMPTY_TREE} --numstat -z --no-renames`]: { stdout: '' },
      [`diff ${EMPTY_TREE} --name-status -z --no-renames`]: { stdout: '' },
      'status --porcelain=v2 -z --no-renames --untracked-files=all': { stdout: '' },
    })
    await expect(new GitWorkspaceChanges(git.run).list(ROOT)).resolves.toEqual({
      branch: 'main',
      files: [],
    })
  })

  it('reports a detached HEAD as no branch', async () => {
    const git = fakeGit({
      ...HEAD_OK,
      'branch --show-current': { stdout: '\n' },
      'diff HEAD --numstat -z --no-renames': { stdout: '' },
      'diff HEAD --name-status -z --no-renames': { stdout: '' },
      'status --porcelain=v2 -z --no-renames --untracked-files=all': { stdout: '' },
    })
    await expect(new GitWorkspaceChanges(git.run).list(ROOT)).resolves.toMatchObject({
      branch: null,
    })
  })

  it('turns a git failure into WorkspaceNotAllowedError', async () => {
    const git = fakeGit({
      ...HEAD_OK,
      'branch --show-current': { exitCode: 128 },
    })
    await expect(new GitWorkspaceChanges(git.run).list(ROOT)).rejects.toMatchObject({
      _tag: 'WorkspaceNotAllowedError',
    })
  })
})

describe('GitWorkspaceChanges.get', () => {
  const STATUS_CLEAN = {
    'status --porcelain=v2 -z --no-renames --untracked-files=all -- src/a.ts': { stdout: '' },
  }

  it('returns the patch of a tracked file', async () => {
    const git = fakeGit({
      ...HEAD_OK,
      ...STATUS_CLEAN,
      'diff HEAD -U3 --no-renames -- src/a.ts': { stdout: 'diff --git a/src/a.ts b/src/a.ts\n' },
    })
    await expect(new GitWorkspaceChanges(git.run).get(ROOT, path('src/a.ts'))).resolves.toEqual({
      kind: 'patch',
      patch: 'diff --git a/src/a.ts b/src/a.ts\n',
    })
  })

  it('uses --no-index for an untracked file and accepts exit 1', async () => {
    const git = fakeGit({
      ...HEAD_OK,
      'status --porcelain=v2 -z --no-renames --untracked-files=all -- docs/new.md': {
        stdout: '? docs/new.md\0',
      },
      'diff --no-index -U3 -- /dev/null docs/new.md': { stdout: 'new file\n', exitCode: 1 },
    })
    await expect(new GitWorkspaceChanges(git.run).get(ROOT, path('docs/new.md'))).resolves.toEqual({
      kind: 'patch',
      patch: 'new file\n',
    })
  })

  it('names a binary file instead of showing bytes', async () => {
    const git = fakeGit({
      ...HEAD_OK,
      ...STATUS_CLEAN,
      'diff HEAD -U3 --no-renames -- src/a.ts': {
        stdout: 'diff --git a/src/a.ts b/src/a.ts\nBinary files a/src/a.ts and b/src/a.ts differ\n',
      },
    })
    await expect(new GitWorkspaceChanges(git.run).get(ROOT, path('src/a.ts'))).resolves.toEqual({
      kind: 'binary',
    })
  })

  it('reports the size above the cap instead of the patch', async () => {
    const git = fakeGit({
      ...HEAD_OK,
      ...STATUS_CLEAN,
      'diff HEAD -U3 --no-renames -- src/a.ts': {
        stdout: Buffer.alloc(CHANGE_PATCH_MAX_BYTES + 1, 0x2b),
      },
    })
    await expect(new GitWorkspaceChanges(git.run).get(ROOT, path('src/a.ts'))).resolves.toEqual({
      kind: 'too-large',
      bytes: CHANGE_PATCH_MAX_BYTES + 1,
    })
  })

  it.each(['../secret', '/etc/passwd', 'src/../../x'])(
    'rejects %s before git runs',
    async (bad) => {
      const git = fakeGit({})
      await expect(new GitWorkspaceChanges(git.run).get(ROOT, path(bad))).rejects.toMatchObject({
        _tag: 'WorkspaceNotAllowedError',
      })
      expect(git.calls).toEqual([])
    },
  )
})
