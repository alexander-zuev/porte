import { createFileRoute } from '@tanstack/react-router'
import { PairCodeEntry } from '@web/features/pair/components/pair-code-entry.tsx'
import { createSeoHead } from '@web/lib/seo.ts'
import { z } from 'zod'

/** Why a previous attempt ended, carried back so the form can explain itself. */
const pairSearchSchema = z.object({
  issue: z.enum(['expired', 'already-decided', 'not-yours', 'unavailable']).optional(),
})

export const Route = createFileRoute('/_auth/pair/code')({
  validateSearch: pairSearchSchema,
  // A live pairing code is typed on this page, so it must never be indexed.
  head: () =>
    createSeoHead({
      title: 'Authorize your Mac | Porte',
      description: 'Enter the code shown by porte pair to connect a Mac to your Porte account.',
      path: '/pair/code',
      noIndex: true,
    }),
  component: PairCodeEntry,
})
