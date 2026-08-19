import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { PairingSignInNotice } from '#/features/auth/components/pairing-sign-in-notice.tsx'
import { SignInFlow } from '#/features/auth/components/sign-in-flow.tsx'
import { internalReturnTo } from '#/lib/auth/internal-return-to.ts'
import { createSeoHead } from '#/lib/seo.ts'

const signInSearchSchema = z.object({
  returnTo: z.string().optional(),
  intent: z.enum(['pair']).optional(),
})

export const Route = createFileRoute('/_public/sign-in')({
  validateSearch: signInSearchSchema,
  // Utility page. noindex keeps it out of search, and the canonical collapses
  // the ?returnTo= variants that would otherwise crawl as duplicate pages.
  head: () =>
    createSeoHead({
      title: 'Sign in | Porte',
      description: 'Sign in to Porte to reach the Grok sessions running on your paired Mac.',
      path: '/sign-in',
      noIndex: true,
    }),
  component: SignInRoute,
})

function SignInRoute() {
  const search = Route.useSearch()
  return (
    <SignInFlow
      notice={search.intent === 'pair' ? <PairingSignInNotice /> : undefined}
      redirectTo={internalReturnTo(search.returnTo)}
    />
  )
}
