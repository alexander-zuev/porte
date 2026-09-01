import type { ChangedFilePath, FileDiff, UncommittedChanges } from '@porte/core/client'

/**
 * Port for reading one working tree: what differs from `HEAD`, and one file's diff.
 *
 * Read-only: nothing here writes the index or the tree. Every call runs git
 * afresh; the Host caches nothing, so the answer is the tree as it is now.
 * A tree that cannot be read throws `WorkspaceNotAllowedError`.
 */
export interface WorkingTree {
  /** Every changed file against `HEAD`, tracked and untracked, plus the branch. */
  changes(gitRoot: string): Promise<UncommittedChanges>
  /**
   * One file's unified diff.
   *
   * @param path - Root-relative, as `changes` returned it. A path that leaves
   * the root throws `WorkspaceNotAllowedError` before git runs.
   */
  diff(gitRoot: string, path: ChangedFilePath): Promise<FileDiff>
}
