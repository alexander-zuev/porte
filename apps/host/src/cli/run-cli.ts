import {
  SessionIdSchema as ConversationIdSchema,
  createTurnId,
  formatPairingCode,
} from '@porte/core'

import { copyToClipboard } from '../adapters/node/clipboard.ts'
import { openUrl } from '../adapters/node/open-url.ts'
import { ConfigError } from '../application/host-error.ts'
import { pairHost } from '../application/pair-host.ts'
import { createHost, type HostComposition } from '../composition/create-host.ts'
import { loadConfig, relayUrlFor } from '../composition/host-config.ts'
import { UsageError, exitCodeFor, formatError, type CliError } from './cli-error.ts'
import { CliRelayObserver } from './cli-relay-observer.ts'
import { ENTER, onKey } from './key-press.ts'
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

  if (command.kind === 'unpair') {
    return unpair(host, io)
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
  const { code, url, quiet, strong, ok } = out.emphasis
  const interactive =  process.stdin.isTTY
  let stopWatching: (() => void) | undefined

  const paired = await pairHost({
    authorizer: host.authorizer,
    credentials: host.credentials,
    baseUrl,
    onPrompt: (prompt) => {
      const shown = formatPairingCode(prompt.userCode)
      const waiting = `Waiting for approval — the code expires in ${String(
        Math.round(prompt.expiresInSeconds / 60),
      )} minutes.  ${WAITING_EMOJI}`

      out.title('Pair this Mac with Porte', PAIR_EMOJI)

      // Piped output cannot deliver a keypress, so it gets the URL and nothing
      // to press. Everything below this line is for a person at a terminal.
      if (!interactive) {
        out.raw(`First copy your pairing code:  ${code(shown)}`)
        out.raw(`Then open ${url(prompt.verificationUri)} in your browser.`)
        out.blank()
        out.raw(quiet(waiting))
        return
      }

      // Both lines are rebuilt from these, so a hint can answer a keypress in place.
      const codeLine = (hint: string) => `First copy your pairing code:  ${code(shown)}   ${hint}`
      const promptLine = `${strong('Press Enter')} to open ${url(
        prompt.verificationUri,
      )} in your browser...`

      out.raw(codeLine(quiet('(press c to copy)')))
      out.prompt(promptLine)

      stopWatching = onKey((key) => {
        if (key === ENTER) {
          stopWatching?.()
          out.blank()
          out.blank()
          out.raw(quiet(waiting))
          void openUrl(prompt.verificationUri)
          return
        }
        if (key.toLowerCase() === 'c') {
          void copyToClipboard(shown).then((copied) => {
            // A missing clipboard tool is a small miss, so it stays quiet.
            const hint = copied ? `${ok('✓')} ${quiet('copied')}` : quiet('✗ no clipboard')
            out.rewrite(codeLine(hint), promptLine)
          })
        }
      })
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  })

  stopWatching?.()
  if (paired.isErr()) return writeError(io, paired.error)

  out.done(`Paired. Run ${code('porte up')} to connect this Mac.`)
  out.note('Unused pairings lapse after 7 days.')
  return 0
}

/**
 * End this Mac's pairing, on Porte and on disk.
 *
 * Revoking runs first: if it fails the credential stays, so the person can try
 * again rather than being left holding a pairing they can no longer end.
 */
async function unpair(host: HostComposition, io: CliIo): Promise<number> {
  const out = createOutput(io.stderr)
  const { strong } = out.emphasis

  const stored = await host.credentials.read()
  if (stored.isErr()) return writeError(io, stored.error)

  // Already unpaired is the state the person asked for, so it is not a failure.
  if (stored.value === null) {
    out.done('This Mac is not paired.')
    return 0
  }

  const revoked = await host.authorizer.revoke(stored.value.token)
  if (revoked.isErr()) return writeError(io, revoked.error)

  const cleared = await host.credentials.clear()
  if (cleared.isErr()) return writeError(io, cleared.error)

  out.done(`Unpaired this Mac from ${strong(new URL(stored.value.baseUrl).host)}`)
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
