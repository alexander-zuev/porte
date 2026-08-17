import { homedir } from 'node:os'
import { join } from 'node:path'

/** Runtime config parsed at the process boundary. */
export type DaemonConfig = {
  readonly grokHome: string
}

/**
 * Resolve Grok home from the process environment.
 *
 * @param env - Process environment. Reads `GROK_HOME` only.
 */
export function loadConfig(env: NodeJS.ProcessEnv): DaemonConfig {
  return {
    grokHome: env.GROK_HOME ?? join(homedir(), '.grok'),
  }
}
