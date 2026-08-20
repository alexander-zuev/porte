import { createFileRoute } from '@tanstack/react-router'
import { createSeoHead } from '@web/lib/seo.ts'
import { PairPage } from '@web/pages/pair/pair-page.tsx'

export const Route = createFileRoute('/_auth/pair/success')({
  head: () =>
    createSeoHead({
      title: 'Mac connected | Porte',
      description: 'This Mac is connected to your Porte account.',
      path: '/pair/success',
      noIndex: true,
    }),
  component: () => <PairPage view="approved" />,
})
