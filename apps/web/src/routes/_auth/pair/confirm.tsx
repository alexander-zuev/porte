import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'

import { pairingQueries } from '#/entities/pairing/pairing-queries.ts'
import { PairConfirmation } from '#/features/pair/components/pair-confirmation.tsx'
import { createSeoHead } from '#/lib/seo.ts'
import { PairPage } from '#/pages/pair/pair-page.tsx'

export const Route = createFileRoute('/_auth/pair/confirm')({
  // Nothing to decide without a claim, and the claim lives in a cookie the
  // server set. Reaching here directly means the attempt is over or never began.
  loader: async ({ context }) => {
    const claim = await context.queryClient.ensureQueryData(pairingQueries.claim())
    if (!claim.claimed) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router performs redirects by throwing this value.
      throw redirect({ to: '/pair' })
    }
  },
  head: () =>
    createSeoHead({
      title: 'Connect this Mac | Porte',
      description: 'Approve or refuse the Mac that asked to connect to your Porte account.',
      path: '/pair/confirm',
      noIndex: true,
    }),
  // No pending component: the loader awaits the claim, so this page never
  // renders without it, and everything else on it is a constant.
  errorComponent: ConfirmUnavailable,
  component: PairConfirmation,
})

/** The claim could not be read. Same card, so nothing on the page moves. */
function ConfirmUnavailable() {
  const navigate = useNavigate()

  return (
    <PairPage
      issue="unavailable"
      view="issue"
      onCancel={() => {
        void navigate({ to: '/dashboard' })
      }}
      onRestart={() => {
        void navigate({ to: '/pair' })
      }}
    />
  )
}
