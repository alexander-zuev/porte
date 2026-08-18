import { createFileRoute } from '@tanstack/react-router'

import { PairPage } from '#/pages/pair/pair-page.tsx'

export const Route = createFileRoute('/pair')({
  component: PairRoute,
})

function PairRoute() {
  return (
    <PairPage
      code=""
      error={undefined}
      pending={false}
      onCodeChange={() => undefined}
      onSubmit={() => undefined}
    />
  )
}
