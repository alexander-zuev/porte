import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { runMcpDaemon } from '@host/entrypoints/mcp/run-mcp-command.ts'
import { createHostRuntime } from '@host/infrastructure/bootstrap/host-runtime.ts'
import {
  createMachineLock,
  createRemoteControlDeps,
} from '@host/infrastructure/bootstrap/remote-control-resources.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'
import { syncGrokConfig } from '@host/infrastructure/grok/hook-installer.ts'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

/** How often the daemon re-reads the sticky choice and the lock. */
const POLL_MS = 5000
/** A relay that closed for malformed frames gets a fresh Host, but not a fast loop of them. */
const PROTOCOL_RESTART_MS = 30_000

/** Run the Grok-session daemon on this process's stdio until Grok ends the session. */
export async function runMcpCommand(config: HostConfig): Promise<void> {
  const deps = createRemoteControlDeps(config)
  const transport = new StdioServerTransport()
  // The SDK transport only closes on read errors; a plain stdin EOF — how Grok
  // ends the session — must end the daemon too, or it outlives the session.
  process.stdin.once('end', () => void transport.close())
  process.once('SIGTERM', () => void transport.close())
  await runMcpDaemon({
    transport,
    lock: createMachineLock(config),
    settings: deps.settings,
    state: deps.state,
    credentials: deps.credentials,
    installHook: async () => {
      const paths = { grokHome: join(homedir(), '.grok'), porteHome: config.dataDirectory }
      await syncGrokConfig(await deps.settings.read(), paths)
    },
    createRuntime: (signal) => createHostRuntime(config, signal),
    pollMs: POLL_MS,
    protocolRestartMs: PROTOCOL_RESTART_MS,
    now: () => Date.now(),
    sleep: (ms) => sleep(ms),
  })
}
