import { createFileRoute } from '@tanstack/react-router'

import { PairingSession } from '#/features/pair/components/pairing-session.tsx'
import { createSeoHead } from '#/lib/seo.ts'

export const Route = createFileRoute('/_auth/pair')({
  // A live pairing code sits on this page, so it must never be indexed and the
  // canonical collapses the ?user_code= variants a shared link would create.
  head: () =>
    createSeoHead({
      title: 'Authorize your Mac | Porte',
      description: 'Approve the code shown by porte pair to connect a Mac to your Porte account.',
      path: '/pair',
      noIndex: true,
    }),
  component: PairingSession,
})
