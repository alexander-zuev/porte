// Must precede every schema-constructing import: zod compiles only schemas built after it.
import 'zod/compile'
import '@web/lib/env/env.ts'
import '@web/lib/observability/instrument.client.ts'
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
