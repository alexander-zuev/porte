import { parseArgs } from 'node:util'

import { UsageError } from './cli-error.ts'
import { VERSION } from './version.ts'

export { VERSION }

/** Root help text. */
export const HELP = `Usage:
  porte <command> [options]

Pair, unpair, or connect this host to Porte.

Options:
  -h, --help       Show help
  -V, --version    Show version
  -v, --verbose    Write debug logs to stderr

Commands:
  pair             Link this machine to your Porte account
  unpair           End this machine's pairing
  up               Connect this host to Porte
  mcp              Run the Grok-session daemon (started by the Grok plugin)
  rc               Remote-control verbs for the Grok hook and skill

Examples:
  porte pair
  porte up
`

/** Help for `porte pair`. */
export const PAIR_HELP = `Usage:
  porte pair

Link this machine to your Porte account. Prints a code to approve in any browser,
then waits. Run this once; \`porte up\` uses what it stores.

Options:
  -h, --help        Show this help

Environment:
  PORTE_URL             Porte origin. Defaults to https://useporte.dev
  PORTE_DATA_DIRECTORY  Host data directory. Defaults to ~/.porte
`

/** Help for `porte unpair`. */
export const UNPAIR_HELP = `Usage:
  porte unpair

End this machine's pairing. Porte stops accepting it, and the local credential is
deleted. Run \`porte pair\` to connect it again.

Options:
  -h, --help        Show this help

Environment:
  PORTE_DATA_DIRECTORY  Host data directory. Defaults to ~/.porte
`

/** Help for `porte up`. */
export const UP_HELP = `Usage:
  porte up

Connect this host to Porte and stay connected. Run \`porte pair\` first.

Options:
  -h, --help        Show this help
  -v, --verbose     Write debug logs to stderr

Environment:
  PORTE_URL             Porte origin. Defaults to https://useporte.dev
  PORTE_DATA_DIRECTORY  Host data directory. Defaults to ~/.porte
`

/** Help for `porte rc`. */
export const RC_HELP = `Usage:
  porte rc <verb>

Remote-control verbs. The Grok plugin runs these; they also work by hand.

Verbs:
  toggle           Turn remote control on or off
  status           One line: on, off, or not paired
  unpair           Remove this machine from your Porte account
  enable-hook      Answer /remote-control instantly, without a model turn
  disable-hook     Back to running /remote-control through the model
  hook             Read a Grok hook payload on stdin, answer on stdout
  watch-pairing    Wait for a phone approval (started by toggle, detached)

Options:
  -h, --help        Show this help
`

/** The rc verbs `porte rc` accepts. */
const RC_VERBS = [
  'hook',
  'toggle',
  'status',
  'unpair',
  'enable-hook',
  'disable-hook',
  'watch-pairing',
] as const

/** One remote-control verb. */
export type RcVerbName = (typeof RC_VERBS)[number]

/** Parsed argv. */
export type Command =
  | { readonly kind: 'help'; readonly text: string }
  | { readonly kind: 'version' }
  | { readonly kind: 'pair' }
  | { readonly kind: 'unpair' }
  | { readonly kind: 'up' }
  | { readonly kind: 'mcp' }
  | { readonly kind: 'rc'; readonly verb: RcVerbName }

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

  if (values.help) {
    const verb = positionals[0]
    if (verb === 'up') {
      return { kind: 'help', text: UP_HELP }
    }
    if (verb === 'pair') {
      return { kind: 'help', text: PAIR_HELP }
    }
    if (verb === 'unpair') {
      return { kind: 'help', text: UNPAIR_HELP }
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
  if (verb === 'up') {
    if (positionals.length !== 1) {
      throw new UsageError({ message: UP_HELP.trimEnd() })
    }
    return { kind: 'up' }
  }
  if (verb === 'pair') {
    if (positionals.length !== 1) {
      throw new UsageError({ message: PAIR_HELP.trimEnd() })
    }
    return { kind: 'pair' }
  }
  if (verb === 'unpair') {
    if (positionals.length !== 1) {
      throw new UsageError({ message: UNPAIR_HELP.trimEnd() })
    }
    return { kind: 'unpair' }
  }
  if (verb === 'mcp') {
    if (positionals.length !== 1) {
      throw new UsageError({ message: HELP.trimEnd() })
    }
    return { kind: 'mcp' }
  }
  if (verb === 'rc') {
    const rcVerb = positionals[1]
    if (positionals.length !== 2 || !isRcVerb(rcVerb)) {
      throw new UsageError({ message: RC_HELP.trimEnd() })
    }
    return { kind: 'rc', verb: rcVerb }
  }
  throw new UsageError({ message: HELP.trimEnd() })
}

function isRcVerb(value: string | undefined): value is RcVerbName {
  return RC_VERBS.some((verb) => verb === value)
}

function parseCommandArgs(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'V', default: false },
      // Read by `main.ts` before this module loads; accepted here so it is not a usage error.
      verbose: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
    strict: true,
  })
}
