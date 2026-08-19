import { createFileRoute } from '@tanstack/react-router'

import { LandingPage } from '#/pages/landing/landing-page.tsx'

export const Route = createFileRoute('/_public/')({
  component: LandingPage,
})
