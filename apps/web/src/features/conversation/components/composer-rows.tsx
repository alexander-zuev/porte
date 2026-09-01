import { cn } from '@web/lib/utils.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import { DrawerBody } from '@web/ui/components/ui/drawer.tsx'
import type { ComponentProps, ReactNode } from 'react'

/**
 * Every composer sheet opens to this one height; only its content changes.
 * Attach, model, and mode read as one surface that swaps pages, never resizes.
 */
export function ComposerSheetBody({ className, ...props }: ComponentProps<typeof DrawerBody>) {
  return <DrawerBody className={cn('h-[40dvh]', className)} {...props} />
}

export type ChoiceProps = Omit<ComponentProps<typeof Button>, 'children'> & {
  readonly icon?: ReactNode
  readonly label: string
  readonly note?: string
  readonly mono?: boolean
  /** Trails the row, where the thumb expects the check or the chevron. */
  readonly trailing?: ReactNode
}

/** A square the thumb lands on: icon over word, the way the phone's own picker draws them. */
export function Tile({ icon, label, className, ...props }: ChoiceProps) {
  return (
    <Button
      className={cn(
        'h-auto min-h-28 flex-col gap-2 rounded-xl [&_svg:not([class*=size-])]:size-7',
        className,
      )}
      type="button"
      variant="secondary"
      {...props}
    >
      {icon}
      {label}
    </Button>
  )
}

export function Row({
  icon,
  label,
  note,
  trailing,
  mono = false,
  className,
  ...props
}: ChoiceProps) {
  return (
    <Button
      className={cn(
        'h-auto min-h-14 w-full justify-start gap-3 rounded-xl px-4 [&_svg:not([class*=size-])]:size-5',
        className,
      )}
      type="button"
      variant="secondary"
      {...props}
    >
      {icon}
      <span className={cn('truncate', mono && 'font-mono')}>{label}</span>
      {note === undefined ? null : (
        <span className="min-w-0 truncate font-sans text-muted-foreground">{note}</span>
      )}
      {trailing === undefined ? null : <span className="ml-auto shrink-0">{trailing}</span>}
    </Button>
  )
}
