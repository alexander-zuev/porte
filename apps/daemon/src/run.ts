import { VERSION, parseCommand } from './cli.ts'
import { listCommand } from './commands/list.ts'
import { resumeCommand } from './commands/resume.ts'
import { loadConfig } from './config.ts'
import { UsageError, exitCodeFor, formatError, type CliError } from './errors.ts'
import { SessionStore } from './sessions/session-store.ts'

/** Streams the CLI writes to. */
export type CliIo = {
  readonly stdout: NodeJS.WritableStream
  readonly stderr: NodeJS.WritableStream
  readonly env: NodeJS.ProcessEnv
}

/**
 * Run one CLI invocation. Logs each error once at this boundary.
 *
 * @param argv - Args after the binary name.
 * @param io - Process streams and env.
 */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  try {
    return await dispatch(args, io)
  } catch (cause) {
    if (cause instanceof UsageError) {
      return writeError(io, cause)
    }
    const detail = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)
    io.stderr.write(`lras v${VERSION} — unexpected error\n${detail}\n`)
    io.stderr.write('Report: https://github.com/alexander-zuev/lras/issues/new\n')
    return 1
  }
}

async function dispatch(argv: readonly string[], io: CliIo): Promise<number> {
  const command = parseCommand(argv)
  if (command.kind === 'help') {
    io.stdout.write(`${command.text}\n`)
    return 0
  }
  if (command.kind === 'version') {
    io.stdout.write(`${VERSION}\n`)
    return 0
  }

  const config = loadConfig(io.env)
  const store = new SessionStore(config.grokHome)

  if (command.kind === 'list') {
    const rows = await listCommand(store)
    if (command.verbose) {
      io.stderr.write(`listed ${String(rows.length)} sessions\n`)
    }
    io.stdout.write(`${JSON.stringify(rows)}\n`)
    return 0
  }

  const result = await resumeCommand(store, command.sessionId, command.prompt, (update) => {
    io.stdout.write(`${JSON.stringify(update)}\n`)
  })
  if (result.isErr()) {
    return writeError(io, result.error)
  }
  return 0
}

function writeError(io: CliIo, error: CliError): number {
  io.stderr.write(`${formatError(error)}\n`)
  return exitCodeFor(error)
}
