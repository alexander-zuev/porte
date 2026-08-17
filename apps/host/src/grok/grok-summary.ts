import { z } from 'zod'

/** On-disk Grok `summary.json` fields used by the host. */
export const grokSummaryFileSchema = z.object({
  info: z.object({
    id: z.string().min(1),
    cwd: z.string().optional(),
  }),
  session_summary: z.string().optional(),
  generated_title: z.string().optional(),
  last_active_at: z.string().optional(),
  updated_at: z.string().optional(),
  session_kind: z.string().optional(),
})

/** Parsed Grok summary file. */
export type GrokSummaryFile = z.infer<typeof grokSummaryFileSchema>
