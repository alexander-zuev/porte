import { parseArgs } from 'node:util'

import { UsageError } from './cli-error.ts'
import { VERSION } from './version.ts'

export { VERSION }

/** Root help text. */
export const HELP = `Usage:
  porte <command> [options]

List local Grok conversations, resume one, or connect this host to Porte.

Options:
  -h, --help       Show help
  -V, --version    Show version
  -v, --verbose    Print debug detail on stderr

Commands:
  list             Print conversations as a JSON array
  resume           Load a conversation and send one prompt
  pair             Link this Mac to your Porte account
  up               Connect this host to Porte

Examples:
  porte list
  porte resume 01a00e6b-2f90-7e61-9288-7c75e3509921 --prompt "What is left?"
  porte pair
  porte up
`

/** Help for `porte resume`. */
export const RESUME_HELP = `Usage:
  porte resume <id> --prompt <text>

Load a Grok conversation by id and send one prompt. Streams Porte events as NDJSON.

Options:
  --prompt <text>  Prompt text (required)
  -h, --help       Show this help
  -v, --verbose    Print debug detail on stderr

Examples:
  porte resume 01a00e6b-2f90-7e61-9288-7c75e3509921 --prompt "What is left?"
`

/** Help for `porte list`. */
export const LIST_HELP = `Usage:
  porte list

Print local Grok conversations as a JSON array. Does not start Grok.

Options:
  -h, --help       Show this help
  -v, --verbose    Print debug detail on stderr
`

/** Help for `porte pair`. */
export const PAIR_HELP = `Usage:
  porte pair

Link this Mac to your Porte account. Prints a code to approve in any browser,
then waits. Run this once; \`porte up\` uses what it stores.

Options:
  -h, --help        Show this help
  -v, --verbose     Print debug detail on stderr

Environment:
  PORTE_URL             Porte origin. Defaults to https://useporte.dev
  PORTE_CREDENTIAL_PATH Where to keep the credential. Defaults to ~/.porte/credentials.json
`

/** Help for `porte up`. */
export const UP_HELP = `Usage:
  porte up

Connect this host to Porte and stay connected. Run \`porte pair\` first.

Options:
  -h, --help        Show this help
  -v, --verbose     Print connection status on stderr

Environment:
  PORTE_URL             Porte origin. Defaults to https://useporte.dev
  PORTE_CREDENTIAL_PATH Where to read the credential from
`

/** Parsed argv. */
export type Command =
  | { readonly kind: 'help'; readonly text: string }
  | { readonly kind: 'version' }
  | { readonly kind: 'list'; readonly verbose: boolean }
  | { readonly kind: 'pair'; readonly verbose: boolean }
  | { readonly kind: 'up'; readonly verbose: boolean }
  | {
      readonly kind: 'resume'
      readonly conversationId: string
      readonly prompt: string
      readonly verbose: boolean
    }

/**
 * Parse POSIX flags and one subcommand.
 *
 * @param argv - Args after the binary name.
 */
export function parseCommand(argv: readonly string[]): Command {
  let parsed: ReturnType<typeof parseCommandArgs>
  try {
    parsed = parseCommandArgs(argv)
  } catch {
    throw new UsageError({ message: HELP.trimEnd() })
  }
  const { values, positionals } = parsed
  const verbose = values.verbose

  if (values.help) {
    const verb = positionals[0]
    if (verb === 'resume') {
      return { kind: 'help', text: RESUME_HELP }
    }
    if (verb === 'list') {
      return { kind: 'help', text: LIST_HELP }
    }
    if (verb === 'up') {
      return { kind: 'help', text: UP_HELP }
    }
    if (verb === 'pair') {
      return { kind: 'help', text: PAIR_HELP }
    }
    return { kind: 'help', text: HELP }
  }
  if (values.version) {
    return { kind: 'version' }
  }

  const verb = positionals[0]
  if (verb === undefined) {
    throw new UsageError({ message: HELP.trimEnd() })
  }
  if (verb === 'list') {
    if (positionals.length !== 1 || values.prompt !== undefined) {
      throw new UsageError({ message: LIST_HELP.trimEnd() })
    }
    return { kind: 'list', verbose }
  }
  if (verb === 'up') {
    if (positionals.length !== 1 || values.prompt !== undefined) {
      throw new UsageError({ message: UP_HELP.trimEnd() })
    }
    return { kind: 'up', verbose }
  }
  if (verb === 'pair') {
    if (positionals.length !== 1 || values.prompt !== undefined) {
      throw new UsageError({ message: PAIR_HELP.trimEnd() })
    }
    return { kind: 'pair', verbose }
  }
  if (verb === 'resume') {
    const conversationId = positionals[1]
    const prompt = values.prompt
    if (conversationId === undefined || prompt === undefined || positionals.length !== 2) {
      throw new UsageError({ message: RESUME_HELP.trimEnd() })
    }
    return { kind: 'resume', conversationId, prompt, verbose }
  }
  throw new UsageError({ message: HELP.trimEnd() })
}

function parseCommandArgs(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'V', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
      prompt: { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  })
}
