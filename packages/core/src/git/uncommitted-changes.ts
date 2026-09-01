import { z } from 'zod'

/** Root-relative path, spelled the way git prints it. */
export const ChangedFilePathSchema = z.string().min(1).brand<'ChangedFilePath'>()
export type ChangedFilePath = z.infer<typeof ChangedFilePathSchema>

/** Git's own words: `--name-status` M, A, D for tracked files; `untracked` for a file git has never seen. */
export const ChangedFileStatusSchema = z.enum(['modified', 'added', 'deleted', 'untracked'])
export type ChangedFileStatus = z.infer<typeof ChangedFileStatusSchema>

/**
 * One uncommitted file. Line counts come from `--numstat`; a binary file has
 * none, because git prints `-\t-` for it.
 */
export const ChangedFileSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    path: ChangedFilePathSchema,
    status: ChangedFileStatusSchema,
    added: z.int().nonnegative(),
    removed: z.int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('binary'),
    path: ChangedFilePathSchema,
    status: ChangedFileStatusSchema,
  }),
])
export type ChangedFile = z.infer<typeof ChangedFileSchema>

/** Everything that differs from `HEAD` in one working tree, tracked and untracked alike. */
export const UncommittedChangesSchema = z.strictObject({
  /** `git branch --show-current`; null on a detached HEAD. */
  branch: z.string().min(1).nullable(),
  files: z.array(ChangedFileSchema),
})
export type UncommittedChanges = z.infer<typeof UncommittedChangesSchema>

/** A diff above this is reported by size, never sent: a reading cap, not a transport one. */
export const FILE_DIFF_MAX_BYTES = 512 * 1024

/** One file's diff as `git diff -U3` printed it, or why it cannot be shown. */
export const FileDiffSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('patch'), patch: z.string() }),
  z.strictObject({ kind: z.literal('binary') }),
  z.strictObject({ kind: z.literal('too-large'), bytes: z.int().positive() }),
])
export type FileDiff = z.infer<typeof FileDiffSchema>
