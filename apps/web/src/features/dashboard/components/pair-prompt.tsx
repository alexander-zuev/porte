import { LaptopIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import { PAIR_COMMAND } from '#/lib/product.ts'
import { TerminalCommand } from '#/ui/components/terminal-command.tsx'
import { Button } from '#/ui/components/ui/button.tsx'

/** Why the account has no Mac to control. */
export type PairPromptReason = 'unpaired' | 'revoked'

export type PairPromptProps = {
  readonly reason: PairPromptReason
  /** Named only when a previous pairing was revoked. */
  readonly hostName?: string
  readonly onEnterCode: () => void
}

const COPY = {
  unpaired: {
    title: 'Pair your Mac',
    body: 'Porte controls Grok sessions on one Mac. Run this there to connect it.',
  },
  revoked: {
    title: 'Pairing was revoked',
    body: 'This Mac no longer accepts remote control. Its sessions and files are untouched.',
  },
} satisfies Record<PairPromptReason, { title: string; body: string }>

/**
 * The whole page when an account controls no Mac.
 *
 * An account without a host has no session list and no session detail, so it
 * gets one surface with one next action instead of an empty two-pane shell.
 */
export function PairPrompt({ reason, hostName, onEnterCode }: PairPromptProps) {
  const copy = COPY[reason]

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-3">
          <span className="text-muted-foreground">
            {reason === 'revoked' ? (
              <WarningCircleIcon aria-hidden className="size-6" />
            ) : (
              <LaptopIcon aria-hidden className="size-6" />
            )}
          </span>
          <h1>{copy.title}</h1>
          <p className="text-muted-foreground">
            {hostName !== undefined && reason === 'revoked' ? `${hostName}. ` : null}
            {copy.body}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <TerminalCommand command={PAIR_COMMAND} />
          <small className="text-muted-foreground">
            Open the link it prints on your phone, then confirm the phrase shown on both devices.
          </small>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onEnterCode}>
            I already have a code
          </Button>
          <Button nativeButton={false} variant="ghost" render={<Link to="/account" />}>
            Account
          </Button>
        </div>
      </div>
    </div>
  )
}
