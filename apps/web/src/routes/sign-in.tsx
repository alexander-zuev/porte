import { createFileRoute } from '@tanstack/react-router'

import { SignInFlow } from '#/features/auth/components/sign-in-flow.tsx'
import { MarketingFrame } from '#/ui/components/marketing-frame.tsx'

export const Route = createFileRoute('/sign-in')({
  component: SignInRoute,
})

function SignInRoute() {
  return (
    <MarketingFrame className="flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <SignInFlow />
      </div>
    </MarketingFrame>
  )
}
