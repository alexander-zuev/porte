import { createFileRoute } from '@tanstack/react-router'
import { createSeoHead } from '@web/lib/seo.ts'
import { PrivacyPage } from '@web/pages/legal/privacy-page.tsx'

export const Route = createFileRoute('/_public/privacy')({
  head: () =>
    createSeoHead({
      title: 'Privacy | Porte',
      description:
        'What the hosted Porte relay stores, and what never leaves your machine. Your repositories, files, and Grok account stay local.',
      path: '/privacy',
    }),
  component: PrivacyPage,
})
