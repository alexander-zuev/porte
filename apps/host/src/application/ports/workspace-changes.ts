import type { ChangePatch, ChangedFilePath, WorkspaceChanges } from '@porte/core/client'

/**
 * Port for reading one git workspace's uncommitted changes.
 *
 * Read-only: nothing here writes the index or the tree. Every call runs git
 * afresh; the Host caches nothing, so the answer is the tree as it is now.
 * A workspace that cannot be read throws `WorkspaceNotAllowedError`.
 */
export interface WorkspaceChangesReader {
  /** Every changed file against `HEAD`, tracked and untracked, plus the branch. */
  list(gitRoot: string): Promise<WorkspaceChanges>
  /**
   * One file's unified diff.
   *
   * @param path - Root-relative, as `list` returned it. A path that leaves the
   * root throws `WorkspaceNotAllowedError` before git runs.
   */
  get(gitRoot: string, path: ChangedFilePath): Promise<ChangePatch>
}
