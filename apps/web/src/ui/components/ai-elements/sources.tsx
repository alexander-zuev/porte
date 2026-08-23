import { BookOpenIcon, CaretDownIcon } from '@phosphor-icons/react'
import { cn } from '@web/lib/utils.ts'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/ui/components/ui/collapsible.tsx'
import type { ComponentProps } from 'react'

/** AI Elements source collection. */
export function Sources({ className, ...props }: ComponentProps<typeof Collapsible>) {
  return <Collapsible className={cn('not-prose text-xs text-primary', className)} {...props} />
}

/** Opens one source collection. */
export function SourcesTrigger({
  count,
  className,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & { readonly count: number }) {
  return (
    <CollapsibleTrigger className={cn('flex min-h-8 items-center gap-2', className)} {...props}>
      <span className="font-medium">{count === 1 ? '1 source' : `${String(count)} sources`}</span>
      <CaretDownIcon aria-hidden className="size-4" />
    </CollapsibleTrigger>
  )
}

/** Holds links in one source collection. */
export function SourcesContent({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return <CollapsibleContent className={cn('mt-2 flex flex-col gap-2', className)} {...props} />
}

/** One source link. */
export function Source({ className, children, ...props }: ComponentProps<'a'>) {
  return (
    <a
      className={cn('flex items-center gap-2 underline-offset-4 hover:underline', className)}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      <BookOpenIcon aria-hidden className="size-4 shrink-0" />
      {children}
    </a>
  )
}
