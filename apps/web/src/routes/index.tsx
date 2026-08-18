import { createFileRoute } from '@tanstack/react-router'

import { LandingPage } from '#/pages/landing/landing-page.tsx'

export const Route = createFileRoute('/')({
  component: LandingPage,
})
