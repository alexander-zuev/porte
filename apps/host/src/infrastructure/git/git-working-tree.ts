import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'

import type { WorkingTree } from '@host/application/ports/working-tree.ts'
import {
  ChangedFilePathSchema,
  FILE_DIFF_MAX_BYTES,
  WorkspaceNotAllowedError,
  type ChangedFile,
  type ChangedFilePath,
  type ChangedFileStatus,
  type FileDiff,
  type UncommittedChanges,
} from '@porte/core/client'

/** What one git invocation produced. Exit codes are data here; the adapter decides which are failures. */
export type GitOutput = {
  readonly stdout: Buffer
  readonly exitCode: number
}

/** Run git with `args` inside `gitRoot`. Rejects only when git could not run at all. */
export type RunGit = (gitRoot: string, args: readonly string[]) => Promise<GitOutput>

/** The tree git diffs against when `HEAD` has no commit yet. */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** `git diff --no-index` says "these differ" with exit 1; for a new file that is the normal answer. */
const NO_INDEX_DIFFERS = 1

const GIT_TIMEOUT_MS = 10_000
const GIT_MAX_BUFFER = 32 * 1024 * 1024

const NAME_STATUS: ReadonlyMap<string, ChangedFileStatus> = new Map([
  ['M', 'modified'],
  ['A', 'added'],
  ['D', 'deleted'],
])

/**
 * Reads a working tree through the `git` binary.
 *
 * Every command runs against one base: `HEAD`, or the empty tree when the
 * repository has no commit. Untracked files are asked for one by one with
 * `--no-index`, because `git diff` does not know them.
 */
export class GitWorkingTree implements WorkingTree {
  constructor(private readonly run: RunGit = spawnGit) {}

  async changes(gitRoot: string): Promise<UncommittedChanges> {
    const base = await this.base(gitRoot)
    const branch = await this.branch(gitRoot)
    const counts = parseNumstat(
      await this.git(gitRoot, ['diff', base, '--numstat', '-z', '--no-renames']),
    )
    const statuses = parseNameStatus(
      await this.git(gitRoot, ['diff', base, '--name-status', '-z', '--no-renames']),
    )
    const untracked = parseUntracked(
      await this.git(gitRoot, [
        'status',
        '--porcelain=v2',
        '-z',
        '--no-renames',
        '--untracked-files=all',
      ]),
    )
    const tracked = counts.map((entry) => withStatus(entry, statuses.get(entry.path) ?? 'modified'))
    const added = await Promise.all(
      untracked.map(async (path) => {
        const output = await this.git(
          gitRoot,
          ['diff', '--no-index', '--numstat', '-z', '--', '/dev/null', path],
          NO_INDEX_DIFFERS,
        )
        const counted = parseNoIndexCounts(output)
        return counted === undefined ? [] : [withStatus({ ...counted, path }, 'untracked')]
      }),
    )
    return { branch, files: [...tracked, ...added.flat()] }
  }

  async diff(gitRoot: string, path: ChangedFilePath): Promise<FileDiff> {
    if (isAbsolute(path) || path.split('/').includes('..')) throw new WorkspaceNotAllowedError()
    const base = await this.base(gitRoot)
    const output = (await this.isUntracked(gitRoot, path))
      ? await this.git(
          gitRoot,
          ['diff', '--no-index', '-U3', '--', '/dev/null', path],
          NO_INDEX_DIFFERS,
        )
      : await this.git(gitRoot, ['diff', base, '-U3', '--no-renames', '--', path])
    if (output.byteLength > FILE_DIFF_MAX_BYTES) {
      return { kind: 'too-large', bytes: output.byteLength }
    }
    const patch = output.toString('utf8')
    if (/^Binary files .* differ$/m.test(patch)) return { kind: 'binary' }
    return { kind: 'patch', patch }
  }

  private async base(gitRoot: string): Promise<string> {
    const output = await this.run(gitRoot, ['rev-parse', '--verify', '--quiet', 'HEAD'])
    return output.exitCode === 0 ? 'HEAD' : EMPTY_TREE
  }

  private async branch(gitRoot: string): Promise<string | null> {
    const name = (await this.git(gitRoot, ['branch', '--show-current'])).toString('utf8').trim()
    return name === '' ? null : name
  }

  private async isUntracked(gitRoot: string, path: ChangedFilePath): Promise<boolean> {
    const output = await this.git(gitRoot, [
      'status',
      '--porcelain=v2',
      '-z',
      '--no-renames',
      '--untracked-files=all',
      '--',
      path,
    ])
    return parseUntracked(output).includes(path)
  }

  /** Run git and keep its stdout; any exit but 0 (or the one allowed) is a workspace failure. */
  private async git(
    gitRoot: string,
    args: readonly string[],
    allowedExit: number = 0,
  ): Promise<Buffer> {
    let output: GitOutput
    try {
      output = await this.run(gitRoot, args)
    } catch {
      throw new WorkspaceNotAllowedError()
    }
    if (output.exitCode !== 0 && output.exitCode !== allowedExit) {
      throw new WorkspaceNotAllowedError()
    }
    return output.stdout
  }
}

/**
 * Spawn git with the process facts pinned: cwd is the root, stdout is bounded,
 * and a deadline kills a hung process. Rejects only when git could not start
 * or overran; an exit code, whatever its value, resolves.
 */
export function spawnGit(gitRoot: string, args: readonly string[]): Promise<GitOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...args], {
      cwd: gitRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    })
    const chunks: Buffer[] = []
    let size = 0
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > GIT_MAX_BUFFER) {
        child.kill()
        reject(new Error('git output exceeded the buffer'))
        return
      }
      chunks.push(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === null) {
        reject(new Error('git was killed'))
        return
      }
      resolve({ stdout: Buffer.concat(chunks), exitCode: code })
    })
  })
}

type CountedFile =
  | Omit<Extract<ChangedFile, { kind: 'text' }>, 'status'>
  | Omit<Extract<ChangedFile, { kind: 'binary' }>, 'status'>

function withStatus(entry: CountedFile, status: ChangedFileStatus): ChangedFile {
  return entry.kind === 'text'
    ? { kind: 'text', path: entry.path, status, added: entry.added, removed: entry.removed }
    : { kind: 'binary', path: entry.path, status }
}

/** `added\tremoved\tpath\0` per file; `-\t-` is a binary file. */
function parseNumstat(output: Buffer): readonly CountedFile[] {
  return records(output).flatMap((record): CountedFile[] => {
    const [added, removed, rawPath] = record.split('\t')
    if (added === undefined || removed === undefined || rawPath === undefined) return []
    const path = ChangedFilePathSchema.parse(rawPath)
    if (added === '-' || removed === '-') return [{ kind: 'binary', path }]
    return [{ kind: 'text', path, added: Number(added), removed: Number(removed) }]
  })
}

/**
 * `--no-index` compares two names, so `-z` prints `added\tremoved\t\0old\0new\0`.
 * Only the counts are wanted; the caller already knows the path it asked about.
 */
function parseNoIndexCounts(
  output: Buffer,
): { kind: 'text'; added: number; removed: number } | { kind: 'binary' } | undefined {
  const [first] = records(output)
  if (first === undefined) return undefined
  const [added, removed] = first.split('\t')
  if (added === undefined || removed === undefined) return undefined
  if (added === '-' || removed === '-') return { kind: 'binary' }
  return { kind: 'text', added: Number(added), removed: Number(removed) }
}

/** `M\0path\0` pairs. Anything git prints that is not M, A, or D reads as modified. */
function parseNameStatus(output: Buffer): ReadonlyMap<string, ChangedFileStatus> {
  const fields = records(output)
  const statuses = new Map<string, ChangedFileStatus>()
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const letter = fields[index]?.slice(0, 1) ?? ''
    const path = fields[index + 1]
    if (path === undefined) continue
    statuses.set(path, NAME_STATUS.get(letter) ?? 'modified')
  }
  return statuses
}

/** Porcelain v2: untracked files are the `? path` records. */
function parseUntracked(output: Buffer): readonly ChangedFilePath[] {
  return records(output).flatMap((record) =>
    record.startsWith('? ') ? [ChangedFilePathSchema.parse(record.slice(2))] : [],
  )
}

/** NUL-terminated records, as every `-z` command prints them. */
function records(output: Buffer): readonly string[] {
  return output
    .toString('utf8')
    .split('\0')
    .filter((record) => record !== '')
}
