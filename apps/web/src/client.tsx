// oxlint-disable-next-line import/no-unassigned-import -- Parse client env before any other boot.
import '@web/lib/env/env.ts'
// oxlint-disable-next-line import/no-unassigned-import -- Sentry must initialize before other imports.
import './instrument.client.ts'
import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  )
})
