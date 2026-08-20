import { setLoggerErrorHook } from '@porte/core'
import * as Sentry from '@sentry/tanstackstart-react'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { settings } from '@web/lib/env/env.ts'

Sentry.init({
  dsn: settings.sentry.dsn,
  environment: settings.sentry.environment,
  enabled: settings.sentry.enabled,
  dataCollection: {
    userInfo: false,
    httpBodies: [],
    genAI: { inputs: false, outputs: false },
  },
  enableLogs: true,
  tracesSampleRate: settings.sentry.tracesSampleRate,
})

setLoggerErrorHook(({ error, context }) => {
  if (isNotFound(error) || isRedirect(error)) return

  const capturedError =
    error instanceof Error ? error : new Error('Logger received a non-Error value')
  Sentry.captureException(capturedError, { extra: context })
})
