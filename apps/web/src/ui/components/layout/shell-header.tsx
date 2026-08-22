import { cn } from '@web/lib/utils.ts'
import type { ReactNode } from 'react'

/**
 * The bar at the top of every page, signed in or not.
 *
 * The height is fixed and its contents are centred in it, so what sits at the
 * left keeps its exact position when a route swaps the wordmark for a way back,
 * an action for none, or the public site for the app. Signing in must not move
 * the wordmark.
 *
 * The measure differs by shell: a landing page is wide, the app is a column.
 * That is the only thing either side chooses.
 */
export function ShellHeader({
  measure,
  lead,
  center,
  action,
  className,
}: {
  readonly measure: 'page' | 'column'
  /** What sits at the left edge. Usually the wordmark. */
  readonly lead: ReactNode
  /** Centred on the bar, not between its neighbours. Absent on the public site. */
  readonly center?: ReactNode
  readonly action?: ReactNode
  readonly className?: string
}) {
  return (
    <header className={className}>
      <div
        className={cn(
          measure === 'page' ? 'container-page' : 'container-column',
          'shell-x relative flex h-20 items-center justify-between gap-4',
        )}
      >
        {lead}
        {/* Centred on the bar rather than in the space left over, so a wordmark
            on one side and an icon on the other do not pull it off centre.
            `pointer-events-none` keeps it from covering either of them. */}
        {center === undefined ? null : (
          <div className="pointer-events-none absolute inset-x-0 flex justify-center">
            <div className="pointer-events-auto min-w-0 px-16">{center}</div>
          </div>
        )}
        {action}
      </div>
    </header>
  )
}
