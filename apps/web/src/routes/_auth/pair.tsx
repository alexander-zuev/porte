import { createFileRoute } from '@tanstack/react-router'

import { PairPage } from '#/pages/pair/pair-page.tsx'

export const Route = createFileRoute('/_auth/pair')({
  component: PairRoute,
})

function PairRoute() {
  return (
    <PairPage
      code=""
      error={undefined}
      pending={false}
      view="code-entry"
      onCodeChange={() => undefined}
      onSubmit={() => undefined}
    />
  )
}
