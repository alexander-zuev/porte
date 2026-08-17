import { z } from 'zod'

import { createAppDeps } from '../app-deps.ts'
import { loadConfig } from '../config.ts'
import { UsageError, exitCodeFor, formatError, type CliError } from '../errors.ts'
import { connectHost } from '../host/connect-host.ts'
import { listSessions } from '../sessions/list-sessions.ts'
import { resumeSession } from '../sessions/resume-session.ts'
import { UP_HELP, VERSION, parseCommand } from './parse-command.ts'

const relayUrlSchema = z.url({ protocol: /^wss?:$/ })

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
  const deps = createAppDeps(config, {
    connected: () => {
      if (command.verbose) io.stderr.write('host connected\n')
    },
    reconnecting: (delayMs) => {
      if (command.verbose) io.stderr.write(`host reconnecting in ${String(delayMs)}ms\n`)
    },
  })

  if (command.kind === 'list') {
    const rows = await listSessions(deps.sessions)
    if (command.verbose) {
      io.stderr.write(`listed ${String(rows.length)} sessions\n`)
    }
    io.stdout.write(`${JSON.stringify(rows)}\n`)
    return 0
  }

  if (command.kind === 'up') {
    const relayUrl = relayUrlSchema.safeParse(command.relayUrl ?? config.relayUrl)
    if (!relayUrl.success || config.daemonToken === undefined || config.daemonToken.length === 0) {
      throw new UsageError({ message: UP_HELP.trimEnd() })
    }
    const controller = new AbortController()
    const stop = (): void => {
      controller.abort()
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      const connected = await connectHost(
        {
          relayUrl: relayUrl.data,
          token: config.daemonToken,
          signal: controller.signal,
        },
        deps.host,
      )
      if (connected.isErr()) return writeError(io, connected.error)
      return 0
    } finally {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
    }
  }

  const result = await resumeSession(deps.sessions, command.sessionId, command.prompt, (update) => {
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
