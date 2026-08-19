import { SessionIdSchema as ConversationIdSchema, createTurnId } from '@porte/core'
import { z } from 'zod'

import { createHost } from '../composition/create-host.ts'
import { loadConfig } from '../composition/host-config.ts'
import { UsageError, exitCodeFor, formatError, type CliError } from './cli-error.ts'
import { CliRelayObserver } from './cli-relay-observer.ts'
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
    io.stderr.write(`porte v${VERSION} — unexpected error\n${detail}\n`)
    io.stderr.write('Report: https://github.com/alexander-zuev/porte/issues/new\n')
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
  const host = createHost(config, new CliRelayObserver(io.stderr, command.verbose))

  if (command.kind === 'list') {
    const listed = await host.agent.listConversations()
    if (listed.isErr()) return writeError(io, listed.error)

    const rows = listed.value
    if (command.verbose) {
      io.stderr.write(`listed ${String(rows.length)} conversations\n`)
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
      const connected = await host.controller.connect({
        relayUrl: relayUrl.data,
        token: config.daemonToken,
        signal: controller.signal,
      })
      if (connected.isErr()) return writeError(io, connected.error)
      return 0
    } finally {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
    }
  }

  const conversationId = ConversationIdSchema.safeParse(command.conversationId)
  if (!conversationId.success) {
    return writeError(io, new UsageError({ message: 'Conversation id is invalid.' }))
  }
  const turnId = createTurnId()
  let finishTurn: (() => void) | undefined
  const finished = new Promise<void>((resolve) => {
    finishTurn = resolve
  })
  const opened = await host.agent.openConversation({
    conversationId: conversationId.data,
    onEvent: (event) => {
      io.stdout.write(`${JSON.stringify(event)}\n`)
      if (event.type === 'turn.finished' && event.turnId === turnId) finishTurn?.()
    },
  })
  if (opened.isErr()) return writeError(io, opened.error)

  const started = await host.agent.startTurn({
    conversationId: conversationId.data,
    turnId,
    prompt: command.prompt,
  })
  if (started.isErr()) {
    await host.agent.closeConversation(conversationId.data)
    return writeError(io, started.error)
  }
  await finished
  const closed = await host.agent.closeConversation(conversationId.data)
  return closed.isErr() ? writeError(io, closed.error) : 0
}

function writeError(io: CliIo, error: CliError): number {
  io.stderr.write(`${formatError(error)}\n`)
  return exitCodeFor(error)
}
