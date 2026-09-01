import type { ChangedFile, ChangedFilePath, FileDiff } from '@porte/core/client'
import type { DiffRow } from '@web/ui/components/ai-elements/tool-output.tsx'
import { parsePatch } from 'diff'

/** The uncommitted changes as the screen reads them: absent, failed, or here. */
export type ChangesView =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly onRetry: () => void }
  | {
      readonly status: 'ready'
      readonly files: readonly ChangedFile[]
      /** Null on a detached HEAD. */
      readonly branch: string | null
    }

/** One file's diff as the screen reads it. */
export type FileDiffView =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly onRetry: () => void }
  | { readonly status: 'ready'; readonly diff: FileDiff }

export type ChangeTotals = {
  readonly files: number
  readonly added: number
  readonly removed: number
}

/** The row's numbers. A binary file counts as a file and adds no lines. */
export function changeTotals(files: readonly ChangedFile[]): ChangeTotals {
  let added = 0
  let removed = 0
  for (const file of files) {
    if (file.kind !== 'text') continue
    added += file.added
    removed += file.removed
  }
  return { files: files.length, added, removed }
}

/**
 * Rows for `DiffBlock` from one file's unified diff.
 *
 * Added and context rows carry the new-side number, removed rows the old-side
 * one, so the gutter reads like the editor after the change. A gap row
 * separates two hunks; git's `@@` header itself is bookkeeping, never shown.
 */
export function patchRows(patch: string): readonly DiffRow[] {
  const [file] = parsePatch(patch)
  if (file === undefined) return []
  const rows: DiffRow[] = []
  file.hunks.forEach((hunk, hunkIndex) => {
    if (hunkIndex > 0) rows.push({ key: `gap${String(hunkIndex)}`, sign: 'gap' })
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    hunk.lines.forEach((raw, index) => {
      const mark = raw.slice(0, 1)
      // `\ No newline at end of file` is a note, not a line.
      if (mark === '\\') return
      const key = `${String(hunkIndex)}:${String(index)}`
      const text = raw.slice(1)
      if (mark === '+') {
        rows.push({ key, sign: 'added', line: newLine, text })
        newLine += 1
      } else if (mark === '-') {
        rows.push({ key, sign: 'removed', line: oldLine, text })
        oldLine += 1
      } else {
        rows.push({ key, sign: 'context', line: newLine, text })
        oldLine += 1
        newLine += 1
      }
    })
  })
  return rows
}

/** Git's own split: files it tracks against `HEAD`, and files it has never seen. */
export type ChangesGroup = 'none' | 'tracked'

/** How the sheet lays the files out. The tree is always by path, folders first. */
export type ChangesLayout =
  | { readonly view: 'tree'; readonly group: ChangesGroup }
  | { readonly view: 'list'; readonly sort: 'path' | 'name'; readonly group: ChangesGroup }

export const DEFAULT_CHANGES_LAYOUT: ChangesLayout = { view: 'tree', group: 'tracked' }

export type ChangesSection = {
  readonly title: 'Tracked' | 'Untracked'
  readonly files: readonly ChangedFile[]
}

/** The sections the sheet draws; an empty one is not drawn. */
export function groupChanges(
  files: readonly ChangedFile[],
  group: ChangesGroup,
): readonly ChangesSection[] {
  if (group === 'none') return [{ title: 'Tracked', files }]
  const tracked = files.filter((file) => file.status !== 'untracked')
  const untracked = files.filter((file) => file.status === 'untracked')
  const sections: ChangesSection[] = []
  if (tracked.length > 0) sections.push({ title: 'Tracked', files: tracked })
  if (untracked.length > 0) sections.push({ title: 'Untracked', files: untracked })
  return sections
}

/** One row of the tree. A folder row is a heading; only file rows open. */
export type TreeRow =
  | { readonly kind: 'folder'; readonly key: string; readonly name: string; readonly depth: number }
  | {
      readonly kind: 'file'
      readonly key: string
      readonly file: ChangedFile
      readonly depth: number
    }

type TreeNode = {
  readonly folders: Map<string, TreeNode>
  readonly files: ChangedFile[]
}

const emptyNode = (): TreeNode => ({ folders: new Map(), files: [] })

/**
 * The files as a tree, folders first at every level, names sorted.
 *
 * A run of folders with one child each folds into one row (`a/b/c`), the way
 * Zed draws it, so a deep repository still reads in two or three levels.
 */
export function changesTree(files: readonly ChangedFile[]): readonly TreeRow[] {
  const root = emptyNode()
  for (const file of files) {
    const segments = file.path.split('/')
    let node = root
    for (const segment of segments.slice(0, -1)) {
      let next = node.folders.get(segment)
      if (next === undefined) {
        next = emptyNode()
        node.folders.set(segment, next)
      }
      node = next
    }
    node.files.push(file)
  }
  const rows: TreeRow[] = []
  emitTree(root, '', 0, rows)
  return rows
}

function emitTree(node: TreeNode, prefix: string, depth: number, rows: TreeRow[]): void {
  const folders = [...node.folders.entries()].toSorted(([a], [b]) => a.localeCompare(b))
  for (const [name, child] of folders) {
    const { label, target } = compact(name, child)
    const key = `${prefix}${label}/`
    rows.push({ kind: 'folder', key, name: label, depth })
    emitTree(target, key, depth + 1, rows)
  }
  const sorted = node.files.toSorted((a, b) =>
    splitPath(a.path).name.localeCompare(splitPath(b.path).name),
  )
  for (const file of sorted) rows.push({ kind: 'file', key: file.path, file, depth })
}

/** Follow single-folder chains with no files, joining their names. */
function compact(name: string, node: TreeNode) {
  let label = name
  let target = node
  while (target.files.length === 0 && target.folders.size === 1) {
    const [entry] = target.folders.entries()
    if (entry === undefined) break
    label = `${label}/${entry[0]}`
    target = entry[1]
  }
  return { label, target }
}

/** The flat list in the asked order. `path` is git's own order, kept as given. */
export function changesList(
  files: readonly ChangedFile[],
  sort: 'path' | 'name',
): readonly ChangedFile[] {
  if (sort === 'path') return files
  return files.toSorted((a, b) => splitPath(a.path).name.localeCompare(splitPath(b.path).name))
}

/** The last path segment and what precedes it, for a file row. */
export function splitPath(path: ChangedFilePath) {
  const at = path.lastIndexOf('/')
  if (at === -1) return { name: path, directory: '' }
  return { name: path.slice(at + 1), directory: path.slice(0, at) }
}
