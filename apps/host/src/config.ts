import { homedir } from 'node:os'
import { join } from 'node:path'

/** Runtime config parsed at the process boundary. */
export type HostConfig = {
  readonly grokHome: string
  readonly relayUrl: string | undefined
  readonly daemonToken: string | undefined
}

/**
 * Resolve host configuration from the process environment.
 *
 * @param env - Process environment to parse.
 */
export function loadConfig(env: NodeJS.ProcessEnv): HostConfig {
  return {
    grokHome: env.GROK_HOME ?? join(homedir(), '.grok'),
    relayUrl: env.LRAS_URL,
    daemonToken: env.LRAS_DAEMON_TOKEN,
  }
}
