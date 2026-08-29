import { createFileRoute } from '@tanstack/react-router'
import { hostConnectionFrom } from '@web/entities/host/host-connection.ts'
import { useRelay } from '@web/features/relay/relay-provider.tsx'
import { createSeoHead } from '@web/lib/seo.ts'
import { PairPage } from '@web/pages/pair/pair-page.tsx'

export const Route = createFileRoute('/_auth/pair/success')({
  head: () =>
    createSeoHead({
      title: 'Machine paired | Porte',
      description: 'This machine is paired with your Porte account.',
      path: '/pair/success',
      noIndex: true,
    }),
  component: PairSuccess,
})

/** The card flips to "connected" when the relay sees the machine, so `porte up` is the last step. */
function PairSuccess() {
  const connected = hostConnectionFrom(useRelay()).status === 'connected'
  return <PairPage connected={connected} view="approved" />
}
