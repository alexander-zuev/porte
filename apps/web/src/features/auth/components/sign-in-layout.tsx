import type { ReactNode } from 'react'

import { PublicShell } from '#/ui/components/public-shell.tsx'

/** Sign-in page: one narrow column centred between the shared header and footer. */
export function SignInLayout({ children }: { readonly children: ReactNode }) {
  return (
    <PublicShell footer="legal">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-xs">{children}</div>
      </div>
    </PublicShell>
  )
}
