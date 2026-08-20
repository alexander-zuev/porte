import { createFileRoute } from '@tanstack/react-router'

import { createSeoHead } from '#/lib/seo.ts'
import { PairPage } from '#/pages/pair/pair-page.tsx'

export const Route = createFileRoute('/_auth/pair/cancelled')({
  head: () =>
    createSeoHead({
      title: 'Pairing cancelled | Porte',
      description: 'That pairing code was refused and no Mac was connected.',
      path: '/pair/cancelled',
      noIndex: true,
    }),
  component: () => <PairPage view="denied" />,
})
