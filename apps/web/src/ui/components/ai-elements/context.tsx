import { CircleNotchIcon } from '@phosphor-icons/react'
import { cn } from '@web/lib/utils.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@web/ui/components/ui/hover-card.tsx'
import { createContext, useContext, useMemo, type ComponentProps } from 'react'

type ContextValue = { readonly usedTokens: number; readonly maxTokens: number }
const ContextState = createContext<ContextValue | null>(null)

/** AI Elements context usage container. */
export function Context({
  usedTokens,
  maxTokens,
  children,
  ...props
}: ComponentProps<typeof HoverCard> & ContextValue) {
  const value = useMemo(() => ({ usedTokens, maxTokens }), [maxTokens, usedTokens])
  return (
    <ContextState.Provider value={value}>
      <HoverCard {...props}>{children}</HoverCard>
    </ContextState.Provider>
  )
}

/** Opens context usage details. */
export function ContextTrigger({ className, ...props }: ComponentProps<typeof Button>) {
  const value = useContextValue()
  const percent = value.maxTokens === 0 ? 0 : value.usedTokens / value.maxTokens
  return (
    <HoverCardTrigger
      render={
        <Button
          className={cn('gap-1.5 text-muted-foreground', className)}
          size="sm"
          variant="ghost"
          {...props}
        />
      }
    >
      <CircleNotchIcon aria-hidden className="size-4" weight="bold" />
      {new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 }).format(
        percent,
      )}
    </HoverCardTrigger>
  )
}

/** Shows the current context usage. */
export function ContextContent({ className, ...props }: ComponentProps<typeof HoverCardContent>) {
  const value = useContextValue()
  const percent = value.maxTokens === 0 ? 0 : (value.usedTokens / value.maxTokens) * 100
  return (
    <HoverCardContent className={cn('space-y-2', className)} {...props}>
      <div className="flex justify-between gap-4 text-xs">
        <span>Context</span>
        <span className="font-mono text-muted-foreground">
          {compact(value.usedTokens)} / {compact(value.maxTokens)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${String(percent)}%` }} />
      </div>
    </HoverCardContent>
  )
}

function useContextValue(): ContextValue {
  const value = useContext(ContextState)
  if (value === null) throw new TypeError('Context parts require Context')
  return value
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value)
}
