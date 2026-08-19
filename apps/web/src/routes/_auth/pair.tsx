import { createFileRoute } from '@tanstack/react-router'

import { PairingSession } from '#/features/pair/components/pairing-session.tsx'

export const Route = createFileRoute('/_auth/pair')({
  component: PairingSession,
})
