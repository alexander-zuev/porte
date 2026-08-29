import {
  reportCliError,
  reportUnexpectedCliError,
} from '@host/entrypoints/cli/cli-error-boundary.ts'
import { isCliError } from '@host/entrypoints/cli/cli-error.ts'
import { runPairCommand } from '@host/entrypoints/cli/pair-command.ts'
import { VERSION, parseCommand } from '@host/entrypoints/cli/parse-command.ts'
import { runUpCommand } from '@host/entrypoints/cli/run-up-command.ts'
import { runUnpairCommand } from '@host/entrypoints/cli/unpair-command.ts'
import { createPairingResources } from '@host/infrastructure/bootstrap/pairing-resources.ts'
import { loadConfig, type HostConfig } from '@host/infrastructure/config/host-config.ts'

/** Process streams and environment used by one CLI invocation. */
export type CliIo = {
  readonly stdout: NodeJS.WritableStream
  readonly stderr: NodeJS.WritableStream
  readonly env: NodeJS.ProcessEnv
}

/** Run one CLI invocation and report each final error once. */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  try {
    return await dispatch(args, io)
  } catch (cause) {
    if (isCliError(cause)) return reportCliError(io.stderr, cause)
    return reportUnexpectedCliError(io.stderr, cause)
  }
}

/** What a bug report needs: version, runtime, platform, and which relay this machine is paired with. */
async function versionReport(config: HostConfig): Promise<string> {
  const stored = await createPairingResources(config).credentials.read()
  const pairing = stored === null ? 'not paired' : `paired with ${new URL(stored.baseUrl).host}`
  return [
    `porte ${VERSION} · node ${process.versions.node} · ${process.platform} ${process.arch}`,
    pairing,
  ].join('\n')
}

async function dispatch(argv: readonly string[], io: CliIo): Promise<number> {
  const command = parseCommand(argv)
  if (command.kind === 'help') {
    io.stdout.write(`${command.text}\n`)
    return 0
  }
  const config = loadConfig(io.env)
  if (command.kind === 'version') {
    io.stdout.write(`${await versionReport(config)}\n`)
    return 0
  }

  if (command.kind === 'up') {
    await runUpCommand({ config, stderr: io.stderr })
    return 0
  }

  if (command.kind === 'pair') {
    return runPairCommand({
      config,
      stderr: io.stderr,
    })
  }
  return runUnpairCommand({
    config,
    stderr: io.stderr,
  })
}
