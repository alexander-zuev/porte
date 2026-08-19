import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'
import { Logo } from '#/ui/components/logo.tsx'
import { Button } from '#/ui/components/ui/button.tsx'

/** Safe host details shown before a phone account claims a pairing attempt. */
export type PairingHostSummary = {
  readonly name: string
  readonly platform: string
}

/** Semantic color for a pairing status icon. */
export type PairingTone = 'info' | 'success' | 'warning'

const TONE_CLASS = {
  info: 'text-status-info',
  success: 'text-status-success',
  warning: 'text-status-warning',
} as const

/** Shared centered pairing scaffold so states occupy the same column. */
export function PairingLayout({
  children,
  actions,
}: {
  readonly children: ReactNode
  readonly actions?: ReactNode
}) {
  return (
    <section className="flex w-full flex-col items-center gap-10 text-center">
      <Logo />
      <div className="flex min-h-44 w-full flex-col items-center justify-center gap-3">
        {children}
      </div>
      <div className="flex min-h-28 w-full flex-col items-center justify-end gap-3">{actions}</div>
    </section>
  )
}

/** Status icon colored by pairing tone. */
export function PairingStatusIcon({
  tone,
  children,
}: {
  readonly tone: PairingTone
  readonly children: ReactNode
}) {
  return <div className={cn('flex items-center justify-center', TONE_CLASS[tone])}>{children}</div>
}

/** Host identity as the primary pairing object. */
export function PairingHost({ host }: { readonly host: PairingHostSummary }) {
  return (
    <div className="flex flex-col gap-1">
      <h1>{host.name}</h1>
      <p className="text-muted-foreground">{host.platform}</p>
    </div>
  )
}

/** Shared verification phrase shown on phone and in the CLI. */
export function VerificationPhrase({ value }: { readonly value: string }) {
  const [copied, setCopied] = useState(false)

  async function copyPhrase() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return
    }
    setCopied(true)
    window.setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-1 rounded-lg bg-muted py-2 pr-2 pl-4">
        <code className="min-w-0 flex-1 bg-transparent p-0">{value}</code>
        <Button
          aria-label={copied ? 'Copied' : 'Copy phrase'}
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            void copyPhrase()
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
      <small className="text-muted-foreground">Also shown in the terminal</small>
    </div>
  )
}
