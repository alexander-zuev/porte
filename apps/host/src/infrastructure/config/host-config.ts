import { homedir } from 'node:os'
import { join } from 'node:path'

import type { FailureClassification } from '@porte/core/client'
import { TaggedError } from 'better-result'
import { z } from 'zod'

/** The process configuration contains a value the Host cannot use. */
export class ConfigError extends TaggedError('ConfigError')<{
  message: string
  classification: FailureClassification
}> {
  constructor(args: { message: string }) {
    super({ ...args, classification: 'terminal' })
  }
}

/** Validated configuration for one Host process. */
export type HostConfig = {
  readonly grokHome: string
  readonly baseUrl: string
  readonly dataDirectory: string
}

const DEFAULT_BASE_URL = 'https://useporte.dev'

const ConfigSchema = z.object({
  grokHome: z.string().min(1, { error: 'GROK_HOME must not be empty' }),
  baseUrl: z.url({
    protocol: /^https?$/,
    error: 'PORTE_URL must be an http or https origin, such as https://useporte.dev',
  }),
  dataDirectory: z.string().min(1, { error: 'PORTE_DATA_DIRECTORY must not be empty' }),
})

/** Read and validate the Host process configuration. */
export function loadConfig(env: NodeJS.ProcessEnv): HostConfig {
  const parsed = ConfigSchema.safeParse({
    grokHome: env.GROK_HOME ?? join(homedir(), '.grok'),
    baseUrl: env.PORTE_URL ?? DEFAULT_BASE_URL,
    dataDirectory: env.PORTE_DATA_DIRECTORY ?? join(homedir(), '.porte'),
  })

  if (parsed.success) return parsed.data

  const detail = parsed.error.issues.map((issue) => `  ${issue.message}`).join('\n')
  throw new ConfigError({ message: detail })
}
