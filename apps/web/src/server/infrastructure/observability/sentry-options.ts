import type { RuntimeEnv } from '@server/infrastructure/runtime-env.ts'

/** Build the Sentry options for one Cloudflare runtime environment. */
export function createSentryOptions(env: RuntimeEnv) {
  return {
    dsn: env.ENVIRONMENT === 'prod' ? env.SENTRY_DSN : '',
    environment: env.ENVIRONMENT,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
    },
    enableLogs: true,
    tracesSampleRate: env.ENVIRONMENT === 'prod' ? 0.1 : 0,
  }
}
