import { createFileRoute, redirect } from '@tanstack/react-router'

import { LandingPage } from '#/pages/landing/landing-page.tsx'

const DESCRIPTION =
  'Porte pairs your phone with the Mac that already runs Grok. Read the transcript, send a prompt, approve the work — from anywhere. Open source, Apache-2.0.'

const TITLE = 'Porte — remote control for local Grok sessions'

export const Route = createFileRoute('/_public/')({
  beforeLoad: ({ context }) => {
    if (context.user !== null) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router performs redirects by throwing this value.
      throw redirect({ to: '/dashboard' })
    }
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
    ],
  }),
  component: LandingPage,
})
