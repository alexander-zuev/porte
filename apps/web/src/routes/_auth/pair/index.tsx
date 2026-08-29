import { createFileRoute } from '@tanstack/react-router'
import { PairStart } from '@web/features/pair/components/pair-start.tsx'
import { createSeoHead } from '@web/lib/seo.ts'

export const Route = createFileRoute('/_auth/pair/')({
  head: () =>
    createSeoHead({
      title: 'Pair your machine | Porte',
      description: 'Run porte pair on the machine that runs Grok, then enter the code it prints.',
      path: '/pair/',
      noIndex: true,
    }),
  component: PairStart,
})
