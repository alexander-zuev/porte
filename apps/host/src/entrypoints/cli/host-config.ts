import { homedir } from 'node:os'
import { join } from 'node:path'

import { ConfigError } from '@host/application/config-error.ts'
import { z } from 'zod'

export { ConfigError }

/** Host configuration parsed at the process boundary. */
export type HostConfig = {
  readonly grokHome: string
  /** Where Porte lives, as an http origin. Both pairing and the relay derive from it. */
  readonly baseUrl: string
  /** Directory for Host files that must persist between CLI invocations. */
  readonly dataDirectory: string
}

/** The hosted relay. Overridden with PORTE_URL when working against a local one. */
const DEFAULT_BASE_URL = 'https://useporte.dev'

/**
 * Each rule names the variable the person can actually change.
 *
 * Not z.httpUrl() for the origin: it demands a public hostname and rejects a
 * local Worker, which is exactly what development points at.
 */
const ConfigSchema = z.object({
  grokHome: z.string().min(1, { error: 'GROK_HOME must not be empty' }),
  baseUrl: z.url({
    protocol: /^https?$/,
    error: 'PORTE_URL must be an http or https origin, such as https://useporte.dev',
  }),
  dataDirectory: z.string().min(1, { error: 'PORTE_DATA_DIRECTORY must not be empty' }),
})

/**
 * Resolve host configuration from the process environment.
 *
 * Validated here rather than where each value is used, so a bad PORTE_URL is
 * one clear message at startup instead of an obscure throw mid-command.
 *
 * @param env - Process environment to parse.
 * @throws ConfigError - When the environment holds a value this cannot use.
 */
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
