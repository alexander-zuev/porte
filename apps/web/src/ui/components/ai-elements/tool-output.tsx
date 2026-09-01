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
    <pre className="max-h-96 overflow-y-auto overscroll-contain rounded-xl bg-surface p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap md:text-sm md:leading-6">
      {children}
    </pre>
  )
}

/** One row of a rendered diff: its number, its colour, its code. */
export type DiffRow = {
  readonly key: string
  readonly sign: 'removed' | 'added'
  readonly line: number
  readonly text: string
}

/**
 * A diff the way a reviewer reads one: numbered rows, the old lines tinted
 * out, the new tinted in, a gutter bar carrying the colour. Code rows keep
 * their alignment — the block scrolls sideways inside its own border.
 */
export function DiffBlock({
  rows,
  title,
}: {
  readonly rows: readonly DiffRow[]
  readonly title?: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-surface">
      {title === undefined ? null : (
        <div className="border-b px-3 py-2 text-xs text-muted-foreground">
          <span className="font-mono">{title}</span>
        </div>
      )}
      <div className="max-h-96 overflow-x-auto overflow-y-auto overscroll-contain py-2">
        <pre className="min-w-max font-mono text-xs leading-5 md:text-sm md:leading-6">
          {rows.map((row) => (
            <span
              key={row.key}
              className={cn(
                'flex min-w-full border-l-2 pr-3',
                row.sign === 'added'
                  ? 'border-status-success bg-status-success-muted/60'
                  : 'border-destructive bg-destructive-muted/60',
              )}
            >
              <span className="w-9 shrink-0 pr-2 text-right text-muted-foreground/70 select-none">
                {row.line}
              </span>
              <span className="whitespace-pre">{row.text === '' ? ' ' : row.text}</span>
            </span>
          ))}
        </pre>
      </div>
    </div>
  )
}
