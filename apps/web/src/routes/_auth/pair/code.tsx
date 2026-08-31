import { PairingCodeSchema } from '@porte/core/client'
import { createFileRoute } from '@tanstack/react-router'
import { createSeoHead } from '@web/lib/seo.ts'
import { PairCodeEntry } from '@web/pages/pair/pair-code-entry.tsx'
import { z } from 'zod'

/** Why a previous attempt ended, carried back so the form can explain itself. */
const pairSearchSchema = z.object({
  issue: z.enum(['expired', 'already-decided', 'not-yours', 'unavailable']).optional(),
  // `user_code` is RFC 8628's name: verification_uri_complete carries the code
  // under it. A malformed value prefills nothing rather than failing the route.
  user_code: PairingCodeSchema.optional().catch(undefined),
})

export const Route = createFileRoute('/_auth/pair/code')({
  validateSearch: pairSearchSchema,
  // A live pairing code is typed on this page, so it must never be indexed.
  head: () =>
    createSeoHead({
      title: 'Authorize your machine | Porte',
      description:
        'Enter the code shown by /remote-control in Grok to connect a machine to your Porte account.',
      path: '/pair/code',
      noIndex: true,
    }),
  component: PairCodeEntry,
})
