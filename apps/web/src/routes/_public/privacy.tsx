import { createFileRoute } from '@tanstack/react-router'

import { PrivacyPage } from '#/pages/legal/privacy-page.tsx'

export const Route = createFileRoute('/_public/privacy')({
  head: () => ({
    meta: [{ title: 'Privacy — Porte' }],
  }),
  component: PrivacyPage,
})
