import type { ReactNode } from 'react'

import { SignInForm, type SignInFormProps } from '#/features/auth/components/sign-in-form.tsx'
import { MarketingFrame } from '#/ui/components/marketing-frame.tsx'

export type SignInPageProps = SignInFormProps & {
  readonly children?: ReactNode
}

export function SignInPage({ children, ...props }: SignInPageProps) {
  return (
    <MarketingFrame className="flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <SignInForm {...props}>{children}</SignInForm>
      </div>
    </MarketingFrame>
  )
}
