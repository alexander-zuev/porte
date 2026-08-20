import { createColors } from 'picocolors'

/**
 * Everything the CLI writes for a person to read.
 *
 * Layout lives here rather than at the call sites, so blank lines and indents
 * stay consistent and a handler says what it means instead of counting spaces.
 * Machine-readable output never passes through this: it goes straight to stdout.
 */

/** Two spaces. Deep enough to group a line under its heading, shallow enough to scan. */
const INDENT = '  '

/**
 * Emoji mark one moment each, never decorate.
 *
 * They are double-width, so they sit at the start of a line where nothing has
 * to line up beneath them.
 */
const EMOJI = {
  pair: '🔗',
  waiting: '⏳',
  done: '✅',
  failed: '❌',
  warned: '⚠️',
} as const

export type Output = {
  /** A blank line. Paragraphs are made here, not with stray newlines. */
  blank: () => void
  /** Opens a section, preceded by space and set in bold. */
  title: (emoji: string, text: string) => void
  /** One numbered instruction in a sequence the reader follows in order. */
  step: (position: number, text: string) => void
  /** Secondary text that supports the line above it. */
  note: (text: string) => void
  /** The command finished and did what it said. */
  done: (text: string) => void
  /** The command stopped without doing it. */
  failed: (text: string) => void
  /** Something to be aware of, which did not stop the command. */
  warned: (text: string) => void
  /** Plain text with no styling, for output that is already formatted. */
  raw: (text: string) => void
  /** Inline emphasis, for composing into the lines above. */
  emphasis: {
    /** A code the person types or reads aloud. */
    code: (text: string) => string
    url: (text: string) => string
    quiet: (text: string) => string
  }
}

/**
 * Build the writer for one stream.
 *
 * Colour follows the stream rather than the process, because Porte prints JSON
 * on stdout and prose on stderr. A piped `porte list` must stay clean while the
 * messages beside it keep their colour.
 *
 * @param stream - The stream this writer writes to.
 */
export function createOutput(stream: NodeJS.WritableStream): Output {
  const c = createColors(isColorAllowed(stream))
  const line = (text: string) => stream.write(`${text}\n`)

  return {
    blank: () => stream.write('\n'),
    title: (emoji, text) => {
      stream.write('\n')
      line(`${emoji}  ${c.bold(text)}`)
      stream.write('\n')
    },
    step: (position, text) => line(`${INDENT}${c.dim(`${String(position)}.`)} ${text}`),
    note: (text) => line(`${INDENT}${c.dim(text)}`),
    done: (text) => {
      stream.write('\n')
      line(`${EMOJI.done} ${c.green(text)}`)
    },
    failed: (text) => {
      stream.write('\n')
      line(`${EMOJI.failed} ${c.red(text)}`)
    },
    warned: (text) => line(`${EMOJI.warned}  ${c.yellow(text)}`),
    raw: (text) => line(text),
    emphasis: {
      code: (text) => c.bold(c.cyan(text)),
      url: (text) => c.underline(c.cyan(text)),
      quiet: (text) => c.dim(text),
    },
  }
}

/** The pairing prompt, which is the one screen a new person always meets. */
export const PAIR_EMOJI = EMOJI.pair
export const WAITING_EMOJI = EMOJI.waiting

/** Honour NO_COLOR, then fall back to whether a person is actually watching. */
function isColorAllowed(stream: NodeJS.WritableStream): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '') return true

  return 'isTTY' in stream && stream.isTTY === true
}
