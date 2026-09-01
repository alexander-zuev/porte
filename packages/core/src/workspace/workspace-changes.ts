import { z } from 'zod'

/** Root-relative path, spelled the way git prints it. */
export const ChangedFilePathSchema = z.string().min(1).brand<'ChangedFilePath'>()
export type ChangedFilePath = z.infer<typeof ChangedFilePathSchema>

/** `untracked` is a file git has never seen; `added` is one staged since `HEAD`. */
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

/** Everything uncommitted in one workspace, tracked and untracked alike. */
export const WorkspaceChangesSchema = z.strictObject({
  /** `git branch --show-current`; null on a detached HEAD. */
  branch: z.string().min(1).nullable(),
  files: z.array(ChangedFileSchema),
})
export type WorkspaceChanges = z.infer<typeof WorkspaceChangesSchema>

/** A patch above this is reported by size, never sent. */
export const CHANGE_PATCH_MAX_BYTES = 512 * 1024

/** One file's diff as `git diff -U3` printed it, or why it cannot be shown. */
export const ChangePatchSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('patch'), patch: z.string() }),
  z.strictObject({ kind: z.literal('binary') }),
  z.strictObject({ kind: z.literal('too-large'), bytes: z.int().positive() }),
])
export type ChangePatch = z.infer<typeof ChangePatchSchema>
