import { createFileRoute } from '@tanstack/react-router'
import { createSeoHead } from '@web/lib/seo.ts'
import { LandingPage } from '@web/pages/landing/landing-page.tsx'

export const Route = createFileRoute('/_public/')({
  head: () =>
    createSeoHead({
      title: 'Porte: remote control for local Grok sessions',
      description:
        'Porte pairs your phone with the Mac that already runs Grok. Pick up a session, start a new one, and approve every action from anywhere. Open source, Apache-2.0.',
      path: '/',
    }),
  component: LandingPage,
})
