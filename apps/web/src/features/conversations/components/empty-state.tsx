import type { ReactNode } from 'react'

export type EmptyStateProps = {
  readonly icon: ReactNode
  readonly title: string
  readonly body: string
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
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-16 text-center">
      <span className="text-muted-foreground [&>svg]:size-7">{icon}</span>

      <div className="flex flex-col gap-2">
        <h2>{title}</h2>
        <p className="mx-auto max-w-[38ch] text-muted-foreground">{body}</p>
      </div>

      {action ? <div className="flex w-full max-w-sm flex-col gap-3">{action}</div> : null}
    </div>
  )
}
