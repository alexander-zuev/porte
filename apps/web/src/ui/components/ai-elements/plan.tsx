import { CaretRightIcon } from '@phosphor-icons/react'
import { cn } from '@web/lib/utils.ts'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@web/ui/components/ui/card.tsx'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/ui/components/ui/collapsible.tsx'
import type { ComponentProps, ReactNode } from 'react'

/** AI Elements plan container. */
export function Plan({
  className,
  children,
  isStreaming,
  ...props
}: ComponentProps<typeof Collapsible> & {
  readonly children: ReactNode
  readonly isStreaming?: boolean
}) {
  return (
    <Collapsible data-streaming={isStreaming ? 'true' : 'false'} {...props}>
      <Card className={cn('gap-3 py-4 shadow-none', className)}>{children}</Card>
    </Collapsible>
  )
}

/** Holds the plan title and action. */
export function PlanHeader({ className, ...props }: ComponentProps<typeof CardHeader>) {
  return <CardHeader className={cn('items-center', className)} {...props} />
}

/** Shows one plan title. */
export function PlanTitle(props: ComponentProps<typeof CardTitle>) {
  return <CardTitle {...props} />
}

/** Shows one plan description. */
export function PlanDescription(props: ComponentProps<typeof CardDescription>) {
  return <CardDescription {...props} />
}

/** Holds the plan toggle. */
export function PlanAction(props: ComponentProps<typeof CardAction>) {
  return <CardAction {...props} />
}

/**
 * Opens or closes one plan.
 *
 * The same caret as a project row, a reasoning block, and a tool call: the app
 * has one gesture for "this opens", and a glyph used nowhere else would promise
 * a behaviour that is not different.
 */
export function PlanTrigger({ className, ...props }: ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      aria-label="Toggle plan"
      className={cn(
        'group flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground motion-reduce:transition-none',
        className,
      )}
      {...props}
    >
      <CaretRightIcon
        aria-hidden
        className="size-3 transition-transform duration-150 ease-out group-data-panel-open:rotate-90 motion-reduce:transition-none"
      />
    </CollapsibleTrigger>
  )
}

/** Holds the expanded plan content. */
export function PlanContent({ className, ...props }: ComponentProps<typeof CardContent>) {
  return (
    <CollapsibleContent>
      <CardContent className={className} {...props} />
    </CollapsibleContent>
  )
}
