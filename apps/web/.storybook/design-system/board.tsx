import { cn } from '@web/lib/utils.ts'
import type { ReactNode } from 'react'

type BoardProps = {
  readonly title: string
  readonly summary: string
  readonly children: ReactNode
}

/** One gallery page. Keeps every board on the same landmark and heading order. */
export function Board({ title, summary, children }: BoardProps) {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-8 md:px-8">
          <small className="text-muted-foreground uppercase">Components</small>
          <h1>{title}</h1>
          <p className="max-w-2xl text-muted-foreground">{summary}</p>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-10 md:px-8">
        {children}
      </div>
    </main>
  )
}

type SectionProps = {
  readonly title: string
  readonly note?: string
  readonly children: ReactNode
}

export function Section({ title, note, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex max-w-2xl flex-col gap-1">
        <h2>{title}</h2>
        {note ? <p className="text-muted-foreground">{note}</p> : null}
      </header>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  )
}

type SpecimenProps = {
  readonly label: string
  readonly note?: string
  /** Stack the examples instead of wrapping them in a row. */
  readonly stack?: boolean
  readonly wide?: boolean
  readonly children: ReactNode
}

export function Specimen({ label, note, stack = false, wide = false, children }: SpecimenProps) {
  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4',
        wide && 'md:col-span-2',
      )}
    >
      <div className="flex flex-col gap-1">
        <h3>{label}</h3>
        {note ? <small className="text-muted-foreground">{note}</small> : null}
      </div>
      <div className={cn('flex min-w-0 gap-3', stack ? 'flex-col' : 'flex-wrap items-center')}>
        {children}
      </div>
    </article>
  )
}
