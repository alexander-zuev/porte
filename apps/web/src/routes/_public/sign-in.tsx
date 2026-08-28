import { getLastLoginMethodFn } from '@server/entrypoints/functions/last-login-method.fn.ts'
import { createFileRoute } from '@tanstack/react-router'
import { PairingSignInNotice } from '@web/features/auth/components/pairing-sign-in-notice.tsx'
import { internalReturnTo } from '@web/lib/auth/internal-return-to.ts'
import { createSeoHead } from '@web/lib/seo.ts'
import { SignInFlow } from '@web/pages/sign-in/sign-in-flow.tsx'
import { z } from 'zod'

const signInSearchSchema = z.object({
  returnTo: z.string().optional(),
  intent: z.enum(['pair']).optional(),
  /** Why the person is back here, when they did not come on purpose. */
  reason: z.enum(['session-expired']).optional(),
})

export const Route = createFileRoute('/_public/sign-in')({
  validateSearch: signInSearchSchema,
  loader: () => getLastLoginMethodFn(),
  // Utility page. noindex keeps it out of search, and the canonical collapses
  // the ?returnTo= variants that would otherwise crawl as duplicate pages.
  head: () =>
    createSeoHead({
      title: 'Sign in | Porte',
      description: 'Sign in to Porte to reach the Grok sessions running on your paired Mac.',
      path: '/sign-in',
      noIndex: true,
    }),
  staticData: { publicShell: 'card' },
  component: SignInRoute,
})

function SignInRoute() {
  const search = Route.useSearch()
  const lastMethod = Route.useLoaderData()
  return (
    <SignInFlow
      lastMethod={lastMethod}
      notice={search.intent === 'pair' ? <PairingSignInNotice /> : undefined}
      redirectTo={internalReturnTo(search.returnTo)}
    />
  )
}
