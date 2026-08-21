import { createLogger } from '@porte/core/client'
import { z, ZodError } from 'zod'

const logger = createLogger('settings')

const envSchema = z.object({
  MODE: z.enum(['development', 'production', 'preview', 'test']).default('development'),
  VITE_SENTRY_DSN: z.string(),
  VITE_POSTHOG_KEY: z.string(),
  VITE_TURNSTILE_SITE_KEY: z.string(),
})

function parseEnv() {
  try {
    return envSchema.parse(import.meta.env)
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => {
        const path = issue.path.join('.')
        return path.length > 0 ? `${path}: ${issue.message}` : issue.message
      })

      console.error('Client env validation failed:')
      for (const issue of issues) console.error(`  - ${issue}`)
      console.error('Current env:', JSON.stringify(import.meta.env, null, 2))

      logger.error('configuration_error', { details: { issues: issues.join('; ') } })
      throw new Error(`Missing or invalid client env: ${issues.join('; ')}`, { cause: error })
    }

    console.error('Client env initialization failed:', error)
    throw error
  }
}

const env = parseEnv()

/** Parsed client env. Invalid configuration refuses to boot. */
export const settings = {
  mode: env.MODE,
  sentry: {
    dsn: env.VITE_SENTRY_DSN,
    environment: env.MODE,
    enabled: env.MODE === 'production',
    tracesSampleRate: env.MODE === 'production' ? 0.1 : 0,
  },
  posthog: {
    apiKey: env.VITE_POSTHOG_KEY,
  },
  turnstile: {
    siteKey: env.VITE_TURNSTILE_SITE_KEY,
  },
}
