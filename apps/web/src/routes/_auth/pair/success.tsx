import { createFileRoute } from '@tanstack/react-router'
import { createSeoHead } from '@web/lib/seo.ts'
import { PairPage } from '@web/pages/pair/pair-page.tsx'

export const Route = createFileRoute('/_auth/pair/success')({
  head: () =>
    createSeoHead({
      title: 'Mac paired | Porte',
      description: 'This Mac is paired with your Porte account.',
      path: '/pair/success',
      noIndex: true,
    }),
  component: () => <PairPage view="approved" />,
})
