import { SessionIdSchema as ConversationIdSchema, createTurnId } from '@porte/core'

import { ConfigError } from '../application/host-error.ts'
import { pairHost } from '../application/pair-host.ts'
import { createHost, type HostComposition } from '../composition/create-host.ts'
import { loadConfig, relayUrlFor } from '../composition/host-config.ts'
import { UsageError, exitCodeFor, formatError, type CliError } from './cli-error.ts'
import { CliRelayObserver } from './cli-relay-observer.ts'
import { PAIR_EMOJI, WAITING_EMOJI, createOutput } from './output.ts'
import { VERSION, parseCommand } from './parse-command.ts'

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
    // Both are thrown rather than returned, because they abort before a command
    // has a result to report.
    if (cause instanceof UsageError || cause instanceof ConfigError) {
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

  if (command.kind === 'pair') {
    return pair(host, config.baseUrl, io)
  }

  if (command.kind === 'up') {
    const stored = await host.credentials.read()
    if (stored.isErr()) return writeError(io, stored.error)
    if (stored.value === null) {
      throw new UsageError({ message: 'Not paired yet. Run `porte pair` first.' })
    }

    // The stored base URL is validated when the credential is read, so the
    // relay endpoint derived from it needs no second check.
    const relayUrl = relayUrlFor(stored.value.baseUrl)
    const controller = new AbortController()
    const stop = (): void => {
      controller.abort()
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      const connected = await host.controller.connect({
        relayUrl,
        token: stored.value.token,
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

/**
 * Link this Mac to an account.
 *
 * Progress goes to stderr so stdout stays a clean stream, matching the other
 * commands. Nothing here is machine-readable; the credential is the output.
 */
async function pair(host: HostComposition, baseUrl: string, io: CliIo): Promise<number> {
  const out = createOutput(io.stderr)
  const { code, url } = out.emphasis

  const paired = await pairHost({
    authorizer: host.authorizer,
    credentials: host.credentials,
    baseUrl,
    onPrompt: (prompt) => {
      const minutes = Math.round(prompt.expiresInSeconds / 60)

      out.title(PAIR_EMOJI, 'Pair this Mac with Porte')
      out.step(1, `Open ${url(prompt.verificationUri)} in any browser`)
      out.step(2, `Sign in, then enter this code:  ${code(prompt.userCode)}`)
      out.blank()
      out.note(
        `${WAITING_EMOJI} Waiting for approval — the code expires in ${String(minutes)} minutes.`,
      )
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  })

  if (paired.isErr()) return writeError(io, paired.error)

  out.done('This Mac is paired.')
  out.blank()
  out.raw(`  Run ${code('porte up')} to connect it.`)
  out.note('The pairing lapses after 7 days without connecting.')
  return 0
}

/**
 * The one place an error reaches a person.
 *
 * Usage text is printed plain: it is help, not a failure, and colouring it red
 * would tell the reader the wrong thing.
 */
function writeError(io: CliIo, error: CliError): number {
  const out = createOutput(io.stderr)
  const body = formatError(error)

  // Usage text is help, not a failure. Marking it as one would mislead.
  if (error._tag === 'UsageError') out.raw(body)
  else out.failed(body)

  return exitCodeFor(error)
}
