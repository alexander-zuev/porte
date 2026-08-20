import { LaptopIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { PAIR_COMMAND } from '@web/lib/product.ts'
import { AppShell } from '@web/ui/components/app-shell.tsx'
import { TerminalCommand } from '@web/ui/components/terminal-command.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'

/**
 * Where an account with no Mac lands.
 *
 * The command comes first because it is the only thing that can happen next,
 * and it happens somewhere else. Entering a code is the second half of that
 * same act, so it is a link rather than a field waiting to be filled.
 */
export function PairStart() {
  return (
    <AppShell>
      <div className="flex flex-1 flex-col justify-center gap-6 py-16">
        <div className="flex flex-col gap-3">
          <span className="text-muted-foreground">
            <LaptopIcon aria-hidden className="size-7" />
          </span>
          <h1>Pair your Mac</h1>
          <p className="max-w-[46ch] text-muted-foreground">
            Porte controls Grok on one Mac. Run this in a terminal there, and it prints a code to
            enter here.
          </p>
        </div>

        <TerminalCommand command={PAIR_COMMAND} />

        <Button
          className="min-h-11 self-start"
          nativeButton={false}
          variant="outline"
          render={<Link to="/pair/code" />}
        >
          I already have a code
        </Button>
      </div>
    </AppShell>
  )
}
