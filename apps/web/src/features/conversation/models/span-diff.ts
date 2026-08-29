import type { ToolContent } from '@porte/core/client'
import { z } from 'zod'

export type SpanDiff = Extract<ToolContent, { type: 'diff' }>

/** Grok puts the line the span starts on in `_meta` (spike, 2026-08-28). */
const positionSchema = z.object({
  old_line: z.number().int().positive(),
  new_line: z.number().int().positive(),
})

/**
 * A unified diff of one edit, for a `diff` code block.
 *
 * Grok's `oldText` and `newText` are the replaced span, not the file, so the
 * patch is every old line out and every new line in. A created file has no
 * old lines. The hunk header is written only when Grok said where the span is.
 */
export function spanDiff(diff: SpanDiff): string {
  const removed = lines(diff.oldText ?? '')
  const added = lines(diff.newText)
  const position = positionSchema.safeParse(diff._meta)
  const hunk = position.success
    ? [
        `@@ -${String(position.data.old_line)},${String(removed.length)} +${String(position.data.new_line)},${String(added.length)} @@`,
      ]
    : []
  return [...hunk, ...removed.map((line) => `-${line}`), ...added.map((line) => `+${line}`)].join(
    '\n',
  )
}

export type LineChange = { readonly added: number; readonly removed: number }

/** `+N −M` for one edit: the lines the span put in and took out. */
export function spanDiffCounts(diff: SpanDiff): LineChange {
  return { added: lines(diff.newText).length, removed: lines(diff.oldText ?? '').length }
}

/** The last path segment: what a block is titled. */
export function fileName(path: string): string {
  return path.split('/').findLast((segment) => segment !== '') ?? path
}

function lines(text: string): string[] {
  if (text === '') return []
  return text.replace(/\n$/, '').split('\n')
}
