import { cn } from '@web/lib/utils.ts'
import type { ComponentProps } from 'react'

/**
 * A table set the way a page sets text: rules, not boxes.
 *
 * One stronger line under the header, hairlines between rows, no vertical
 * lines and no frame, so a table inside an answer reads as part of the
 * answer rather than a widget dropped into it. The first and last cells sit
 * flush with the text edge for the same reason. A wide table scrolls
 * sideways in its own strip instead of widening the page.
 */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="scrollbar-thin relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  )
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('border-b border-border-interactive', className)}
      {...props}
    />
  )
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

export function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t border-border-interactive font-medium', className)}
      {...props}
    />
  )
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr data-slot="table-row" className={cn('border-b border-border', className)} {...props} />
}

/** Column names sit low and quiet, so the eye lands on the first row of values. */
export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'px-3 py-2 text-left align-bottom font-medium text-muted-foreground first:pl-0 last:pr-0',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-3 py-2 align-top first:pl-0 last:pr-0', className)}
      {...props}
    />
  )
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-2 text-muted-foreground', className)}
      {...props}
    />
  )
}
