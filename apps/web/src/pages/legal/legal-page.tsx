import type { ReactNode } from 'react'

import { PublicShell } from '#/ui/components/public-shell.tsx'

/** Props for a legal document page. */
export type LegalPageProps = {
  readonly title: string
  /** Date the document last changed, already formatted for reading. */
  readonly updated: string
  readonly children: ReactNode
}

/** Prose column shared by Terms and Privacy. */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-14 md:px-10">
        <h1>{title}</h1>
        <small className="text-muted-foreground">Last updated {updated}</small>
        <div className="mt-10 flex flex-col gap-8">{children}</div>
      </div>
    </PublicShell>
  )
}

/** One titled section of a legal document. */
export function LegalSection({
  heading,
  children,
}: {
  readonly heading: string
  readonly children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2>{heading}</h2>
      {children}
    </section>
  )
}
