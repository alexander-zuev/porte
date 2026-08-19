import { setLoggerErrorHook } from '@porte/core'
import * as Sentry from '@sentry/tanstackstart-react'
import { isNotFound, isRedirect } from '@tanstack/react-router'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  dataCollection: {
    userInfo: false,
    httpBodies: [],
    genAI: { inputs: false, outputs: false },
  },
  enableLogs: true,
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
})

setLoggerErrorHook(({ error, context }) => {
  if (isNotFound(error) || isRedirect(error)) return

  const capturedError =
    error instanceof Error ? error : new Error('Logger received a non-Error value')
  Sentry.captureException(capturedError, { extra: context })
})
