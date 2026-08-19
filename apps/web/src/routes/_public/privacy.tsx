import { createFileRoute } from '@tanstack/react-router'

import { createSeoHead } from '#/lib/seo.ts'
import { PrivacyPage } from '#/pages/legal/privacy-page.tsx'

export const Route = createFileRoute('/_public/privacy')({
  head: () =>
    createSeoHead({
      title: 'Privacy | Porte',
      description:
        'What the hosted Porte relay stores, and what never leaves your Mac. Your repositories, files, and Grok account stay local.',
      path: '/privacy',
    }),
  component: PrivacyPage,
})
