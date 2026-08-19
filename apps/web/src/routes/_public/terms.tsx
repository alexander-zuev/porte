import { createFileRoute } from '@tanstack/react-router'

import { createSeoHead } from '#/lib/seo.ts'
import { TermsPage } from '#/pages/legal/terms-page.tsx'

export const Route = createFileRoute('/_public/terms')({
  head: () =>
    createSeoHead({
      title: 'Terms of Service | Porte',
      description: 'The terms that cover the hosted Porte relay. The software is Apache-2.0.',
      path: '/terms',
    }),
  component: TermsPage,
})
