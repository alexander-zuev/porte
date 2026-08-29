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
  pair             Link this Mac to your Porte account
  unpair           End this Mac's pairing
  up               Connect this host to Porte

Examples:
  porte pair
  porte up
`

/** Help for `porte pair`. */
export const PAIR_HELP = `Usage:
  porte pair

Link this Mac to your Porte account. Prints a code to approve in any browser,
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

End this Mac's pairing. Porte stops accepting it, and the local credential is
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

/** Parsed argv. */
export type Command =
  | { readonly kind: 'help'; readonly text: string }
  | { readonly kind: 'version' }
  | { readonly kind: 'pair' }
  | { readonly kind: 'unpair' }
  | { readonly kind: 'up' }

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
  throw new UsageError({ message: HELP.trimEnd() })
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
