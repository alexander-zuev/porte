import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { SignInFlow } from '#/features/auth/components/sign-in-flow.tsx'
import { MarketingFrame } from '#/ui/components/marketing-frame.tsx'

const DEFAULT_RETURN_TO = '/dashboard'
const RETURN_TO_BASE = 'https://porte.invalid'
const signInSearchSchema = z.object({
  returnTo: z.string().optional(),
})

export const Route = createFileRoute('/sign-in')({
  validateSearch: signInSearchSchema,
  component: SignInRoute,
})

function SignInRoute() {
  const search = Route.useSearch()
  return (
    <MarketingFrame className="flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <SignInFlow redirectTo={internalReturnTo(search.returnTo)} />
      </div>
    </MarketingFrame>
  )
}

function internalReturnTo(value: string | undefined): string {
  const parsed = value === undefined ? null : URL.parse(value, RETURN_TO_BASE)
  if (parsed === null || parsed.origin !== RETURN_TO_BASE) return DEFAULT_RETURN_TO
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
