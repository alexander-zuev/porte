import { cn } from '@web/lib/utils.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@web/ui/components/ui/popover.tsx'
import { createContext, useContext, useMemo, type ComponentProps } from 'react'

type ContextValue = { readonly usedTokens: number; readonly maxTokens: number }
const ContextState = createContext<ContextValue | null>(null)

/** AI Elements context usage container. */
export function Context({
  usedTokens,
  maxTokens,
  children,
  ...props
}: ComponentProps<typeof Popover> & ContextValue) {
  const value = useMemo(() => ({ usedTokens, maxTokens }), [maxTokens, usedTokens])
  return (
    <ContextState.Provider value={value}>
      <Popover {...props}>{children}</Popover>
    </ContextState.Provider>
  )
}

/** Opens context usage details; the ring fills clockwise as the window fills. */
export function ContextTrigger({ className, ...props }: ComponentProps<typeof Button>) {
  const fraction = fractionOf(useContextValue())
  return (
    <PopoverTrigger
      render={
        <Button
          className={cn('gap-1.5 text-muted-foreground', className)}
          size="sm"
          variant="ghost"
          {...props}
        />
      }
    >
      <ContextRing fraction={fraction} />
      {/* The ring alone on a phone; the composer row has no room for the number. */}
      <span className="hidden md:inline">{percent(fraction)}</span>
    </PopoverTrigger>
  )
}

/** Shows the current context usage; children sit under the count, for the cost. */
export function ContextContent({
  className,
  children,
  ...props
}: ComponentProps<typeof PopoverContent>) {
  const value = useContextValue()
  const fraction = fractionOf(value)
  return (
    <PopoverContent align="end" className={cn('w-64 gap-3', className)} {...props}>
      <div className="flex items-baseline justify-between gap-2">
        <PopoverTitle render={<h4>Context</h4>} />
        <span className="text-muted-foreground">{percent(fraction)}</span>
      </div>
      <div
        aria-valuemax={value.maxTokens}
        aria-valuemin={0}
        aria-valuenow={value.usedTokens}
        className="h-2 overflow-hidden rounded-full bg-surface-active"
        role="progressbar"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: percent(fraction) }} />
      </div>
      <small className="text-muted-foreground">
        {compact(value.usedTokens)} of {compact(value.maxTokens)} tokens
      </small>
      {children}
    </PopoverContent>
  )
}

/** Empty track at zero; the arc grows clockwise from twelve o'clock. */
function ContextRing({ fraction }: { readonly fraction: number }) {
  return (
    <svg aria-hidden className="size-4 -rotate-90" fill="none" viewBox="0 0 16 16">
      <circle className="opacity-25" cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" />
      {fraction === 0 ? null : (
        <circle
          cx="8"
          cy="8"
          pathLength={1}
          r="6"
          stroke="currentColor"
          strokeDasharray={`${String(fraction)} 1`}
          strokeLinecap="round"
          strokeWidth="3"
        />
      )}
    </svg>
  )
}

function useContextValue(): ContextValue {
  const value = useContext(ContextState)
  if (value === null) throw new TypeError('Context parts require Context')
  return value
}

/** Clamped so a stale window size never draws past a full ring. */
function fractionOf(value: ContextValue): number {
  if (value.maxTokens === 0) return 0
  return Math.min(1, value.usedTokens / value.maxTokens)
}

function percent(fraction: number): string {
  return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 }).format(
    fraction,
  )
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value)
}
