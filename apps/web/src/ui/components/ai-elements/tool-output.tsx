import { cn } from '@web/lib/utils.ts'
import type { ComponentProps } from 'react'

/**
 * The one tool-row shape: a quiet line in the transcript, a list entry in a
 * sheet. Shared as a class so drawer and collapsible triggers can wear it too.
 */
export const toolRowClass =
  'group flex min-h-11 w-full items-center gap-2 rounded-md text-left text-muted-foreground transition-colors duration-150 ease-out outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none'

/** A tool row that is a plain button, for sheet lists. */
export function ToolRowButton({ className, ...props }: ComponentProps<'button'>) {
  return <button className={cn(toolRowClass, className)} type="button" {...props} />
}

/**
 * The bordered monospace box a tool's field or output sits in.
 * Text wraps, so the page never scrolls sideways.
 */
export function MonoBox({
  children,
  className,
}: {
  readonly children: string
  readonly className?: string
}) {
  return (
    <pre
      className={cn(
        'rounded-xl border bg-surface p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap md:text-sm md:leading-6',
        className,
      )}
    >
      {children}
    </pre>
  )
}

/**
 * Terminal output: no border, but its own surface, capped and scrolling
 * inside its own height so the words read as an inset, not an outline.
 */
export function PlainOutput({ children }: { readonly children: string }) {
  return (
    <pre
      tabIndex={0}
      className="max-h-96 overflow-y-auto overscroll-contain rounded-xl bg-surface p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap md:text-sm md:leading-6"
    >
      {children}
    </pre>
  )
}

/** One line of a read file: its number and its code. */
export type NumberedLine = {
  readonly key: string
  readonly line: number
  readonly text: string
}

/**
 * A read file the way an editor shows one: a number gutter, then the code.
 * Same card, cap, and scroll as a diff, minus the colour.
 */
export function FileLines({ lines }: { readonly lines: readonly NumberedLine[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-surface">
      <div
        className="max-h-96 overflow-x-auto overflow-y-auto overscroll-contain py-2"
        tabIndex={0}
      >
        <pre className="min-w-max font-mono text-xs leading-5 md:text-sm md:leading-6">
          {lines.map((one) => (
            <span key={one.key} className="flex min-w-full pr-3">
              <span className="w-9 shrink-0 pr-2 text-right text-muted-foreground select-none">
                {one.line}
              </span>
              <span className="whitespace-pre">{one.text === '' ? ' ' : one.text}</span>
            </span>
          ))}
        </pre>
      </div>
    </div>
  )
}

/**
 * One row of a rendered diff. A code row has its number, its colour, its
 * text; a gap row stands for the unchanged lines skipped between two hunks.
 */
export type DiffRow =
  | {
      readonly key: string
      readonly sign: 'removed' | 'added' | 'context'
      readonly line: number
      readonly text: string
    }
  | { readonly key: string; readonly sign: 'gap' }

const ROW_TINT = {
  added: 'border-status-success bg-status-success-muted/60',
  removed: 'border-destructive bg-destructive-muted/60',
  context: 'border-transparent',
} satisfies Record<Exclude<DiffRow['sign'], 'gap'>, string>

/**
 * A diff the way a reviewer reads one: numbered rows, the old lines tinted
 * out, the new tinted in, a gutter bar carrying the colour. Code rows keep
 * their alignment — the block scrolls sideways inside its own border.
 *
 * `unbounded` drops the height cap for a surface that scrolls on its own,
 * such as a sheet; the transcript keeps the cap.
 */
export function DiffBlock({
  rows,
  title,
  unbounded = false,
}: {
  readonly rows: readonly DiffRow[]
  readonly title?: string
  readonly unbounded?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-surface">
      {title === undefined ? null : (
        <div className="border-b px-3 py-2 text-xs text-muted-foreground">
          {/* A path has no spaces to wrap at, so it breaks anywhere rather than clipping. */}
          <span className="font-mono break-all">{title}</span>
        </div>
      )}
      <div
        className={cn(
          'overflow-x-auto overscroll-contain py-2',
          !unbounded && 'max-h-96 overflow-y-auto',
        )}
        tabIndex={0}
      >
        <pre className="min-w-max font-mono text-xs leading-5 md:text-sm md:leading-6">
          {rows.map((row) =>
            row.sign === 'gap' ? (
              // Lines were skipped here; the numbers on either side say how many.
              <span
                key={row.key}
                aria-label="Unchanged lines skipped"
                className="flex min-w-full border-l-2 border-transparent bg-muted/40 pr-3 text-muted-foreground"
              >
                <span className="w-9 shrink-0 pr-2 text-right select-none">⋯</span>
              </span>
            ) : (
              <span
                key={row.key}
                className={cn('flex min-w-full border-l-2 pr-3', ROW_TINT[row.sign])}
              >
                <span className="w-9 shrink-0 pr-2 text-right text-muted-foreground select-none">
                  {row.line}
                </span>
                <span className="whitespace-pre">{row.text === '' ? ' ' : row.text}</span>
              </span>
            ),
          )}
        </pre>
      </div>
    </div>
  )
}
