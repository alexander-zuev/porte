import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { PairCodeEntry } from '#/features/pair/components/pair-code-entry.tsx'
import { createSeoHead } from '#/lib/seo.ts'

/** Why a previous attempt ended, carried back so the form can explain itself. */
const pairSearchSchema = z.object({
  issue: z.enum(['expired', 'already-decided', 'not-yours', 'unavailable']).optional(),
})

export const Route = createFileRoute('/_auth/pair/')({
  validateSearch: pairSearchSchema,
  // A live pairing code is typed on this page, so it must never be indexed.
  head: () =>
    createSeoHead({
      title: 'Authorize your Mac | Porte',
      description: 'Enter the code shown by porte pair to connect a Mac to your Porte account.',
      path: '/pair',
      noIndex: true,
    }),
  component: PairCodeEntry,
})
