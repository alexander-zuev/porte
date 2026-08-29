import { createColors } from 'picocolors'
import { z } from 'zod'

/**
 * Everything the CLI writes for a person to read.
 *
 * Layout lives here rather than at the call sites, so blank lines and indents
 * stay consistent and a handler says what it means instead of counting spaces.
 * Machine-readable output never passes through this: it goes straight to stdout.
 */

/** Two spaces. Deep enough to group a line under its heading, shallow enough to scan. */
const INDENT = '  '

/** Move the cursor to the start of the previous line. */
const CURSOR_UP = '\u001b[1A'

/** Return to column zero and erase what is there. */
const CLEAR_LINE = '\r\u001b[2K'
/** Clears everything from the cursor down, however many rows that turns out to be. */
const CLEAR_BELOW = '\r\u001b[0J'
/** Assumed width when a stream is not a terminal and reports none. */
const FALLBACK_COLUMNS = 80

/**
 * Marks for one moment each, never decoration.
 *
 * Placement follows width, not habit. A single-width glyph can lead a line
 * because it shifts nothing after it; an emoji is double-width and would push
 * its text out of column, so emoji trail the line they mark instead.
 */
const EMOJI = {
  pair: '🚪',
  waiting: '⏳',
  done: '✓',
  failed: '✗',
  warned: '!',
} as const

export type Output = {
  /** A blank line. Paragraphs are made here, not with stray newlines. */
  blank: () => void
  /** Opens a section, preceded by space and set in bold. Any mark trails it. */
  title: (text: string, mark?: string) => void
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
  /**
   * A line that replaces the previous `status` line on a terminal, so a long
   * wait shows one changing line instead of a growing list. Elsewhere it is a
   * plain line. `done`, `failed`, and `warned` end the sequence.
   */
  status: (text: string) => void
  /** A line awaiting a keypress. No newline, so the cursor rests after it. */
  prompt: (text: string) => void
  /**
   * Redraw the line above the prompt, and the prompt under it.
   *
   * Lets a hint answer a keypress in place instead of pushing a new line and
   * leaving the stale one above it. Terminal only: the escapes it writes are
   * noise anywhere else, so call it only where `prompt` was used.
   */
  rewrite: (above: string, prompt: string) => void
  /** Inline emphasis, for composing into the lines above. */
  emphasis: {
    /** A code the person types or reads aloud. */
    code: (text: string) => string
    url: (text: string) => string
    quiet: (text: string) => string
    /** A name inside a sentence, such as the server or account acted on. */
    strong: (text: string) => string
    /** A small thing that just succeeded, inside a line that continues. */
    ok: (text: string) => string
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
  const terminal = 'isTTY' in stream && stream.isTTY === true
  // Rows the last `status` line took, so the next one can erase exactly that.
  let statusRows = 0
  const endStatus = () => {
    statusRows = 0
  }

  return {
    blank: () => stream.write('\n'),
    title: (text, mark) => {
      stream.write('\n')
      line(mark === undefined ? c.bold(text) : `${c.bold(text)}  ${mark}`)
      stream.write('\n')
    },
    step: (position, text) => line(`${INDENT}${c.dim(`${String(position)}.`)} ${text}`),
    note: (text) => line(`${INDENT}${c.dim(text)}`),
    // The mark carries the outcome, so the sentence stays plain and readable.
    done: (text) => {
      endStatus()
      stream.write('\n')
      line(`${c.green(EMOJI.done)} ${text}`)
    },
    failed: (text) => {
      endStatus()
      stream.write('\n')
      line(`${c.red(EMOJI.failed)} ${text}`)
    },
    warned: (text) => {
      endStatus()
      line(`${EMOJI.warned} ${c.yellow(text)}`)
    },
    raw: (text) => line(text),
    status: (text) => {
      if (terminal && statusRows > 0) {
        stream.write(`${CURSOR_UP.repeat(statusRows)}${CLEAR_BELOW}`)
      }
      line(text)
      statusRows = terminal ? rowsUsed(text, terminalColumns(stream)) : 0
    },
    prompt: (text) => stream.write(text),
    rewrite: (above, prompt) => {
      // Both lines may have wrapped, and the cursor sits at the end of the last
      // row of the prompt. Counting rows is what keeps a long URL from leaving
      // the line it was meant to replace on screen.
      const columns = terminalColumns(stream)
      const up = rowsUsed(above, columns) + rowsUsed(prompt, columns) - 1

      stream.write(`${CURSOR_UP.repeat(up)}${CLEAR_BELOW}${above}\n${prompt}`)
    },
    emphasis: {
      code: (text) => c.bold(c.cyan(text)),
      url: (text) => c.underline(c.cyan(text)),
      quiet: (text) => c.dim(text),
      strong: (text) => c.bold(text),
      ok: (text) => c.green(text),
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

/** How many rows a line takes once the terminal wraps it. */
function rowsUsed(text: string, columns: number): number {
  return Math.max(1, Math.ceil(visibleLength(text) / columns))
}

/** Colour codes occupy no columns, so they cannot count towards the width. */
function visibleLength(text: string): number {
  // oxlint-disable-next-line no-control-regex -- Matching the escape sequences is the point.
  return text.replace(/\u001b\[[0-9;]*m/g, '').length
}

/** A terminal reports its width. A pipe reports none and wraps at nothing. */
const widthSchema = z.object({ columns: z.number().int().positive() })

function terminalColumns(stream: NodeJS.WritableStream): number {
  const parsed = widthSchema.safeParse(stream)
  return parsed.success ? parsed.data.columns : FALLBACK_COLUMNS
}
