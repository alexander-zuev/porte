import { parseArgs } from 'node:util'

import { UsageError } from './errors.ts'
import { VERSION } from './version.ts'

export { VERSION }

/** Root help text. */
export const HELP = `Usage:
  lras <command> [options]

List local Grok sessions, or resume one and stream ACP updates.

Options:
  -h, --help       Show help
  -V, --version    Show version
  -v, --verbose    Print debug detail on stderr

Commands:
  list             Print sessions as a JSON array
  resume           Load a session and send one prompt

Examples:
  lras list
  lras resume 01a00e6b-2f90-7e61-9288-7c75e3509921 --prompt "What is left?"
`

/** Help for `lras resume`. */
export const RESUME_HELP = `Usage:
  lras resume <id> --prompt <text>

Load a Grok session by id and send one prompt. Streams ACP updates as NDJSON.

Options:
  --prompt <text>  Prompt text (required)
  -h, --help       Show this help
  -v, --verbose    Print debug detail on stderr

Examples:
  lras resume 01a00e6b-2f90-7e61-9288-7c75e3509921 --prompt "What is left?"
`

/** Help for `lras list`. */
export const LIST_HELP = `Usage:
  lras list

Print local Grok sessions as a JSON array. Does not start Grok.

Options:
  -h, --help       Show this help
  -v, --verbose    Print debug detail on stderr
`

/** Parsed argv. */
export type Command =
  | { readonly kind: 'help'; readonly text: string }
  | { readonly kind: 'version' }
  | { readonly kind: 'list'; readonly verbose: boolean }
  | {
      readonly kind: 'resume'
      readonly sessionId: string
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
  if (verb === 'resume') {
    const sessionId = positionals[1]
    const prompt = values.prompt
    if (sessionId === undefined || prompt === undefined || positionals.length !== 2) {
      throw new UsageError({ message: RESUME_HELP.trimEnd() })
    }
    return { kind: 'resume', sessionId, prompt, verbose }
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
