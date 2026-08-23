import type { ReactNode } from 'react'

export type EmptyStateProps = {
  readonly icon: ReactNode
  readonly title: string
  /** One quiet line under the title. What the title is, rather than what to do. */
  readonly meta?: ReactNode
  readonly body: ReactNode
  /** A command to run, or a button. Absent when there is nothing to do yet. */
  readonly action?: ReactNode
}

/**
 * The shape every "there is nothing here" screen takes.
 *
 * One layout for all of them, so moving between not paired, not connected, and
 * no conversations reads as one place changing rather than three screens. The
 * mark, the line, and the next action always sit in the same spot.
 */
export function EmptyState({ icon, title, meta, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="text-muted-foreground [&>svg]:size-12">{icon}</span>

        {/* The icon, title, and meta identify one state. */}
        <div className="flex flex-col gap-1">
          <h2 className="break-words">{title}</h2>
          {meta === undefined ? null : <small className="text-muted-foreground">{meta}</small>}
        </div>
      </div>

      <p className="mx-auto max-w-[38ch] text-muted-foreground">{body}</p>

      {/* Sized to itself, not to the column: a button stretched to the measure
          reads as a bar, and there is only ever one thing to press here. */}
      {action ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3">{action}</div>
      ) : null}
    </div>
  )
}
