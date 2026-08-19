import { createFileRoute } from '@tanstack/react-router'

import { TermsPage } from '#/pages/legal/terms-page.tsx'

export const Route = createFileRoute('/_public/terms')({
  head: () => ({
    meta: [{ title: 'Terms of Service — Porte' }],
  }),
  component: TermsPage,
})
