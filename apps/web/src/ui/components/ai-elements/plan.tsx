import { CaretUpDownIcon } from '@phosphor-icons/react'
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

/** Opens or closes one plan. */
export function PlanTrigger({ className, ...props }: ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      aria-label="Toggle plan"
      className={cn(
        'flex size-8 items-center justify-center rounded-md hover:bg-accent',
        className,
      )}
      {...props}
    >
      <CaretUpDownIcon aria-hidden className="size-4" />
    </CollapsibleTrigger>
  )
}

/** Holds the expanded plan content. */
export function PlanContent({ className, ...props }: ComponentProps<typeof CardContent>) {
  return (
    <CollapsibleContent className="overflow-hidden">
      <CardContent className={className} {...props} />
    </CollapsibleContent>
  )
}
