import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { PairingSignInNotice } from '#/features/auth/components/pairing-sign-in-notice.tsx'
import { SignInFlow } from '#/features/auth/components/sign-in-flow.tsx'
import { internalReturnTo } from '#/lib/auth/internal-return-to.ts'

const signInSearchSchema = z.object({
  returnTo: z.string().optional(),
  intent: z.enum(['pair']).optional(),
})

export const Route = createFileRoute('/_public/sign-in')({
  validateSearch: signInSearchSchema,
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
