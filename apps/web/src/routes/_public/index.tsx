import { createFileRoute } from '@tanstack/react-router'
import { createSeoHead } from '@web/lib/seo.ts'
import { LandingPage } from '@web/pages/landing/landing-page.tsx'

export const Route = createFileRoute('/_public/')({
  head: () =>
    createSeoHead({
      title: 'Porte: remote control for local Grok sessions',
      description:
        'Pair your phone with the machine that runs Grok. Pick up a session, start a new one, and approve every action from anywhere.',
      path: '/',
    }),
  staticData: { publicShell: 'hero' },
  component: LandingPage,
})
