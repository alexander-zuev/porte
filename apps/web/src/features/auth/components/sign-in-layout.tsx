import { PublicShell } from '@web/ui/components/public-shell.tsx'
import type { ReactNode } from 'react'

/** One column under the centred wordmark, matching the pairing screens. */
export function SignInLayout({ children }: { readonly children: ReactNode }) {
  return (
    <PublicShell footer="legal" header="brand">
      {/* Wide enough for the pairing notice to read as sentences, not a column. */}
      <div className="w-full max-w-sm">{children}</div>
    </PublicShell>
  )
}
